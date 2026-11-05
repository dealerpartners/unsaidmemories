import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireDocs } from "@/lib/admin/docs-store";
import { withPg } from "@/lib/crm/enterprise";
import { isMissingTable, DOCS_SCHEMA_MSG } from "@/lib/admin/docs-store";

export const dynamic = "force-dynamic";

// GET /api/admin/docs/versions?article_id=<uuid> -> version history, newest first.
export async function GET(req: NextRequest) {
  const denied = await requireDocs(req, "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const articleId = new URL(req.url).searchParams.get("article_id") || "";
  if (!articleId) return NextResponse.json({ error: "article_id is required." }, { status: 400 });
  try {
    const rows = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT v.*, a.title AS article_title, a.status AS article_status
           FROM public.doc_article_versions v
           JOIN public.doc_articles a ON a.id = v.article_id AND a.tenant_id = v.tenant_id
          WHERE v.tenant_id = $1 AND v.article_id = $2::uuid
          ORDER BY v.version_number DESC`,
        [tenant, articleId],
      );
      return rows;
    });
    if (!rows) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json({ versions: rows });
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not load versions." }, { status: 500 });
  }
}
