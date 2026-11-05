import { NextRequest, NextResponse } from "next/server";
import { withPg } from "@/lib/crm/enterprise";
import {
  requireDocs, resolveTenantId, isMissingTable, DOCS_SCHEMA_MSG,
  slugify, docsAudit,
} from "@/lib/admin/docs-store";

export const dynamic = "force-dynamic";

// GET /api/admin/docs/sections -> sections with their domain, ordered.
export async function GET(req: NextRequest) {
  const denied = await requireDocs(req, "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const rows = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT s.*, d.slug AS domain_slug, d.title AS domain_title, d.number AS domain_number,
                (SELECT count(*)::int FROM public.doc_articles a
                  WHERE a.tenant_id = s.tenant_id AND a.section_id = s.id) AS article_count
           FROM public.doc_sections s
           LEFT JOIN public.doc_domains d ON d.id = s.domain_id AND d.tenant_id = s.tenant_id
          WHERE s.tenant_id = $1
          ORDER BY d.sort NULLS LAST, s.sort NULLS LAST, s.number`,
        [tenant],
      );
      return rows;
    });
    if (!rows) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json({ sections: rows });
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not load sections." }, { status: 500 });
  }
}

// POST /api/admin/docs/sections { domain_id, parent_id?, number, title, slug?, description? }
// Creates a new section under a domain, optionally nested under a parent section.
export async function POST(req: NextRequest) {
  const denied = await requireDocs(req, "write");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const b = await req.json().catch(() => ({}));
  const domainId = String(b.domain_id || "");
  const parentId = String(b.parent_id || "") || null;
  const number = String(b.number || "").trim();
  const title = String(b.title || "").trim();
  const slug = slugify(String(b.slug || b.title || ""));
  const description = String(b.description || "").trim() || null;
  if (!domainId) return NextResponse.json({ error: "domain_id is required." }, { status: 400 });
  if (!number) return NextResponse.json({ error: "Number is required (e.g. 3.8.14)." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!slug) return NextResponse.json({ error: "Slug is required." }, { status: 400 });

  try {
    const out = await withPg(async (c) => {
      // Parent (when given) must belong to the same tenant + domain.
      if (parentId) {
        const p = await c.query(
          `SELECT id FROM public.doc_sections WHERE tenant_id = $1 AND id = $2::uuid AND domain_id = $3::uuid`,
          [tenant, parentId, domainId],
        );
        if (!p.rows.length)
          throw Object.assign(new Error("Parent section not found in this domain."), { statusCode: 400 });
      }
      const { rows } = await c.query(
        `INSERT INTO public.doc_sections
           (tenant_id, domain_id, parent_id, number, title, slug, description, sort)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7,
                 COALESCE((SELECT max(sort) FROM public.doc_sections
                           WHERE tenant_id = $1 AND domain_id = $2::uuid
                             AND COALESCE(parent_id::text,'') = COALESCE($3,'')), 0) + 10)
         RETURNING *`,
        [tenant, domainId, parentId, number, title, slug, description],
      );
      return rows[0];
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    await docsAudit({
      tenant, action: "section.create", entityType: "section", entityId: out.id,
      after: out, req,
    });
    return NextResponse.json({ section: out }, { status: 201 });
  } catch (e: any) {
    if (e?.statusCode === 400) return NextResponse.json({ error: e.message }, { status: 400 });
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    if (e?.code === "23505")
      return NextResponse.json({ error: "That number or slug is already taken for this tenant." }, { status: 409 });
    return NextResponse.json({ error: "Could not create the section." }, { status: 500 });
  }
}
