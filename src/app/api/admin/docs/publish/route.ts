import { NextRequest, NextResponse } from "next/server";
import { withPg } from "@/lib/crm/enterprise";
import { getCurrentUser } from "@/lib/auth/server";
import {
  requireDocs, resolveTenantId, isMissingTable, DOCS_SCHEMA_MSG,
  DOCS_CONTENT_TYPES, docsAudit, revalidateDocPaths, masterTenantId,
} from "@/lib/admin/docs-store";

export const dynamic = "force-dynamic";

// POST /api/admin/docs/publish { article_id, change_note? }
// Validate → version_number = MAX+1 → INSERT doc_article_versions →
// UPDATE doc_articles SET status='published', published_at=now() →
// audit write → revalidatePath. All in one transaction (audit is best-effort, outside it).
export async function POST(req: NextRequest) {
  const denied = await requireDocs(req, "publish");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const b = await req.json().catch(() => ({}));
  const articleId = String(b.article_id || "");
  const changeNote = String(b.change_note || "").trim() || null;
  if (!articleId) return NextResponse.json({ error: "article_id is required." }, { status: 400 });

  let publishedBy: string | null = null;
  try {
    publishedBy = (await getCurrentUser())?.email?.toLowerCase() || null;
  } catch { /* best effort */ }

  try {
    const out = await withPg(async (c) => {
      await c.query("BEGIN");
      try {
        const cur = await c.query(
          `SELECT a.*, s.slug AS section_slug, d.slug AS domain_slug
             FROM public.doc_articles a
             LEFT JOIN public.doc_sections s ON s.id = a.section_id AND s.tenant_id = a.tenant_id
             LEFT JOIN public.doc_domains d ON d.id = s.domain_id AND d.tenant_id = a.tenant_id
            WHERE a.tenant_id = $1 AND a.id = $2::uuid FOR UPDATE`,
          [tenant, articleId],
        );
        const row = cur.rows[0];
        if (!row) { await c.query("ROLLBACK"); return { error: "Not found.", status: 404 }; }
        if (row.status === "published") { await c.query("ROLLBACK"); return { error: "Already published.", status: 409 }; }
        if (row.status === "retired") { await c.query("ROLLBACK"); return { error: "Retired articles cannot be republished — restore a version to draft first.", status: 409 }; }

        // S4 policy-class guardrail: a non-master tenant's policy article
        // publishes only after master sign-off (signoff_status =
        // 'approved', migration 20261112). Enforced HERE, at publish
        // time — and it fails closed: until the sign-off state exists
        // and reads 'approved', tenant policy content does not publish.
        // The master's own policies and all non-policy content are
        // unaffected.
        if (row.content_type === "policy") {
          const masterId = await masterTenantId(c);
          if (tenant !== masterId && row.signoff_status !== "approved") {
            await c.query("ROLLBACK");
            return {
              error: row.signoff_status === "rejected"
                ? "Master sign-off was rejected for this policy — revise it with the master tenant before publishing."
                : "This is a tenant policy article: publishing requires master sign-off first (the master queue lives in the Document Center).",
              status: 403,
            };
          }
        }

        // ---- validation (Sunny's spec) ----
        if (!row.title?.trim()) { await c.query("ROLLBACK"); return { error: "Title is required.", status: 422 }; }
        if (!row.body?.trim()) { await c.query("ROLLBACK"); return { error: "Body is empty — write the article before publishing.", status: 422 }; }
        if (!row.section_id) { await c.query("ROLLBACK"); return { error: "Article has no section.", status: 422 }; }
        const dup = await c.query(
          `SELECT 1 FROM public.doc_articles WHERE tenant_id = $1 AND slug = $2 AND id <> $3::uuid LIMIT 1`,
          [tenant, row.slug, articleId],
        );
        if (dup.rows.length) { await c.query("ROLLBACK"); return { error: "That slug is already taken for this tenant.", status: 422 }; }
        const sec = await c.query(
          `SELECT 1 FROM public.doc_sections WHERE tenant_id = $1 AND id = $2::uuid`,
          [tenant, row.section_id],
        );
        if (!sec.rows.length) { await c.query("ROLLBACK"); return { error: "The article's section no longer exists.", status: 422 }; }
        const aud = await c.query(
          `SELECT 1 FROM public.doc_audiences WHERE tenant_id = $1 AND slug = $2`,
          [tenant, row.audience_slug],
        );
        if (!aud.rows.length) { await c.query("ROLLBACK"); return { error: "Unknown audience.", status: 422 }; }
        if (!DOCS_CONTENT_TYPES.includes(row.content_type)) { await c.query("ROLLBACK"); return { error: "Unknown content type.", status: 422 }; }

        const vn = await c.query(
          `SELECT COALESCE(MAX(version_number), 0) + 1 AS n
             FROM public.doc_article_versions
            WHERE tenant_id = $1 AND article_id = $2::uuid`,
          [tenant, articleId],
        );
        const versionNumber = Number(vn.rows[0]?.n || 1);

        const upd = await c.query(
          `UPDATE public.doc_articles
              SET status = 'published', published_at = now(), updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid
            RETURNING *`,
          [tenant, articleId],
        );
        const ver = await c.query(
          `INSERT INTO public.doc_article_versions
             (tenant_id, article_id, version_number, title, body, change_note, published_by)
           VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
           RETURNING *`,
          [tenant, articleId, versionNumber, row.title, row.body, changeNote, publishedBy],
        );
        await c.query("COMMIT");
        return {
          article: upd.rows[0],
          version: ver.rows[0],
          paths: { domain: row.domain_slug, section: row.section_slug, slug: row.slug },
          before: { status: row.status },
        };
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      }
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });

    await docsAudit({
      tenant, action: "article.publish", entityType: "article", entityId: articleId,
      before: out.before, after: { status: "published", version_number: out.version.version_number, change_note: changeNote },
      req,
    });
    revalidateDocPaths(out.paths.domain, out.paths.section, out.paths.slug);
    return NextResponse.json({ article: out.article, version: out.version });
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not publish the article." }, { status: 500 });
  }
}
