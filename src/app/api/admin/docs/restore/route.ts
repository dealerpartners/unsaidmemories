import { NextRequest, NextResponse } from "next/server";
import { withPg } from "@/lib/crm/enterprise";
import {
  requireDocs, resolveTenantId, isMissingTable, DOCS_SCHEMA_MSG,
  docsAudit, revalidateDocPaths,
} from "@/lib/admin/docs-store";

export const dynamic = "force-dynamic";

// POST /api/admin/docs/restore { article_id, version_id }
// Copies a past version's title/body into doc_articles as status='draft'.
// Version rows are never rewritten; the next publish mints a new version number.
export async function POST(req: NextRequest) {
  const denied = await requireDocs(req, "publish");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const b = await req.json().catch(() => ({}));
  const articleId = String(b.article_id || "");
  const versionId = String(b.version_id || "");
  if (!articleId || !versionId)
    return NextResponse.json({ error: "article_id and version_id are required." }, { status: 400 });

  try {
    const out = await withPg(async (c) => {
      const v = await c.query(
        `SELECT v.title, v.body, v.version_number,
                s.slug AS section_slug, d.slug AS domain_slug
           FROM public.doc_article_versions v
           JOIN public.doc_articles a ON a.id = v.article_id AND a.tenant_id = v.tenant_id
           LEFT JOIN public.doc_sections s ON s.id = a.section_id AND s.tenant_id = a.tenant_id
           LEFT JOIN public.doc_domains d ON d.id = s.domain_id AND d.tenant_id = a.tenant_id
          WHERE v.tenant_id = $1 AND v.id = $2::uuid AND v.article_id = $3::uuid`,
        [tenant, versionId, articleId],
      );
      const ver = v.rows[0];
      if (!ver) return { notFound: true as const };
      const before = await c.query(
        `SELECT status FROM public.doc_articles WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, articleId],
      );
      const { rows } = await c.query(
        `UPDATE public.doc_articles
            SET title = $3, body = $4, status = 'draft', updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING *`,
        [tenant, articleId, ver.title, ver.body],
      );
      return {
        article: rows[0] || null,
        versionNumber: ver.version_number,
        beforeStatus: before.rows[0]?.status || null,
        paths: { domain: ver.domain_slug, section: ver.section_slug, slug: rows[0]?.slug },
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ("notFound" in out || !out.article)
      return NextResponse.json({ error: "Version not found." }, { status: 404 });

    await docsAudit({
      tenant, action: "article.restore", entityType: "article", entityId: articleId,
      before: { status: out.beforeStatus },
      after: { status: "draft", from_version: out.versionNumber },
      req,
    });
    revalidateDocPaths(out.paths.domain, out.paths.section, out.paths.slug);
    return NextResponse.json({ article: out.article });
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not restore the version." }, { status: 500 });
  }
}
