import { NextRequest, NextResponse } from "next/server";
import { withPg } from "@/lib/crm/enterprise";
import {
  requireDocs, resolveTenantId, isMissingTable, DOCS_SCHEMA_MSG,
  docsAudit, revalidateDocPaths,
} from "@/lib/admin/docs-store";

export const dynamic = "force-dynamic";

// POST /api/admin/docs/retire { article_id }
// Published -> retired. No delete for published articles — retire instead.
// Retired articles leave the public site immediately (revalidatePath).
export async function POST(req: NextRequest) {
  const denied = await requireDocs(req, "publish");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const b = await req.json().catch(() => ({}));
  const articleId = String(b.article_id || "");
  if (!articleId) return NextResponse.json({ error: "article_id is required." }, { status: 400 });

  try {
    const out = await withPg(async (c) => {
      const cur = await c.query(
        `SELECT a.status, a.title, s.slug AS section_slug, d.slug AS domain_slug
           FROM public.doc_articles a
           LEFT JOIN public.doc_sections s ON s.id = a.section_id AND s.tenant_id = a.tenant_id
           LEFT JOIN public.doc_domains d ON d.id = s.domain_id AND d.tenant_id = a.tenant_id
          WHERE a.tenant_id = $1 AND a.id = $2::uuid`,
        [tenant, articleId],
      );
      const row = cur.rows[0];
      if (!row) return { error: "Not found.", status: 404 };
      if (row.status !== "published")
        return { error: `Only published articles can be retired (this one is ${row.status}).`, status: 409 };
      const { rows } = await c.query(
        `UPDATE public.doc_articles
            SET status = 'retired', updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING *`,
        [tenant, articleId],
      );
      return { article: rows[0], paths: { domain: row.domain_slug, section: row.section_slug, slug: rows[0].slug } };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });

    await docsAudit({
      tenant, action: "article.retire", entityType: "article", entityId: articleId,
      before: { status: "published" }, after: { status: "retired" }, req,
    });
    revalidateDocPaths(out.paths.domain, out.paths.section, out.paths.slug);
    return NextResponse.json({ article: out.article });
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not retire the article." }, { status: 500 });
  }
}
