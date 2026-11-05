import { NextRequest, NextResponse } from "next/server";
import { withPg } from "@/lib/crm/enterprise";
import {
  requireDocs, resolveTenantId, isMissingTable, DOCS_SCHEMA_MSG,
  DOCS_CONTENT_TYPES, slugify, docsAudit, masterTenantId,
} from "@/lib/admin/docs-store";

export const dynamic = "force-dynamic";

// GET /api/admin/docs/articles -> { articles: [...] } (all statuses),
// each row carrying its section + domain for the admin tree.
//
// S4 editor scope: the resolved (identity-bound) tenant's own articles
// come back scope='own'. A non-master session ALSO sees the master
// tenant's published global articles, scope='master' — read-only in the
// editor (the API's tenant predicate refuses their writes regardless).
// A master session additionally sees every tenant's policy articles
// awaiting sign-off, scope='signoff' — the master sign-off queue inside
// the same editor.
export async function GET(req: NextRequest) {
  const denied = await requireDocs(req, "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const rows = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT a.*, 'own' AS scope,
                s.number AS section_number, s.title AS section_title, s.slug AS section_slug,
                d.slug AS domain_slug, d.title AS domain_title, d.number AS domain_number
           FROM public.doc_articles a
           LEFT JOIN public.doc_sections s ON s.id = a.section_id AND s.tenant_id = a.tenant_id
           LEFT JOIN public.doc_domains d ON d.id = s.domain_id AND d.tenant_id = a.tenant_id
          WHERE a.tenant_id = $1
          ORDER BY d.sort NULLS LAST, s.sort NULLS LAST, a.sort NULLS LAST, a.title`,
        [tenant],
      );
      const masterId = await masterTenantId(c);
      if (masterId && masterId !== tenant) {
        const { rows: masterRows } = await c.query(
          `SELECT a.*, 'master' AS scope,
                  s.number AS section_number, s.title AS section_title, s.slug AS section_slug,
                  d.slug AS domain_slug, d.title AS domain_title, d.number AS domain_number
             FROM public.doc_articles a
             LEFT JOIN public.doc_sections s ON s.id = a.section_id AND s.tenant_id = a.tenant_id
             LEFT JOIN public.doc_domains d ON d.id = s.domain_id AND d.tenant_id = a.tenant_id
            WHERE a.tenant_id = $1 AND a.status = 'published'
            ORDER BY d.sort NULLS LAST, s.sort NULLS LAST, a.sort NULLS LAST, a.title`,
          [masterId],
        ).catch(() => ({ rows: [] as any[] }));
        rows.push(...masterRows);
      }
      if (masterId && masterId === tenant) {
        const { rows: queue } = await c.query(
          `SELECT a.*, 'signoff' AS scope,
                  s.number AS section_number, s.title AS section_title, s.slug AS section_slug,
                  d.slug AS domain_slug, d.title AS domain_title, d.number AS domain_number,
                  t.name AS owner_tenant_name
             FROM public.doc_articles a
             LEFT JOIN public.doc_sections s ON s.id = a.section_id AND s.tenant_id = a.tenant_id
             LEFT JOIN public.doc_domains d ON d.id = s.domain_id AND d.tenant_id = a.tenant_id
             LEFT JOIN public.tenants t ON t.id = a.tenant_id
            WHERE a.tenant_id <> $1 AND a.content_type = 'policy'
              AND a.signoff_status = 'pending'
            ORDER BY a.updated_at ASC`,
          [tenant],
        ).catch(() => ({ rows: [] as any[] }));
        rows.push(...queue);
      }
      return rows;
    });
    if (!rows) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json({ articles: rows });
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not load articles." }, { status: 500 });
  }
}

// POST /api/admin/docs/articles -> creates a draft article.
// The editor creates the draft first, then navigates to /admin/docs/article/[id].
// number mirrors the section number (label-only); section is fixed at create.
export async function POST(req: NextRequest) {
  const denied = await requireDocs(req, "write");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || "").trim() || "Untitled article";
  const slug = slugify(String(b.slug || b.title || ""));
  if (!slug) return NextResponse.json({ error: "Slug is required." }, { status: 400 });
  const sectionId = String(b.section_id || "");
  if (!sectionId) return NextResponse.json({ error: "section_id is required." }, { status: 400 });
  const audience = String(b.audience_slug || "buyer").trim() || "buyer";
  const contentType = DOCS_CONTENT_TYPES.includes(b.content_type) ? b.content_type : "article";

  try {
    const out = await withPg(async (c) => {
      // Section must exist in this tenant; number mirrors the section (label-only).
      const s = await c.query(
        `SELECT number FROM public.doc_sections WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, sectionId],
      );
      if (!s.rows.length) throw Object.assign(new Error("Section not found."), { statusCode: 400 });
      // Audience must be one of the 12 seeded values.
      const a = await c.query(
        `SELECT 1 FROM public.doc_audiences WHERE tenant_id = $1 AND slug = $2`,
        [tenant, audience],
      );
      if (!a.rows.length) throw Object.assign(new Error("Unknown audience."), { statusCode: 400 });
      // S4 sign-off: a non-master tenant's policy-class article starts at
      // 'pending' — it cannot publish until a master session signs off
      // (migration 20261112). Everything else is 'not_required'.
      const masterId = await masterTenantId(c);
      const signoff = contentType === "policy" && masterId !== null && tenant !== masterId ? "pending" : "not_required";
      const { rows } = await c.query(
        `INSERT INTO public.doc_articles
           (tenant_id, section_id, number, title, slug, audience_slug, content_type, status, body, keywords, portal_link, sort, signoff_status)
         VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, 'draft', $8, NULLIF($9,''), NULLIF($10,''), COALESCE($11, 0), $12)
         RETURNING *`,
        [
          tenant, sectionId, s.rows[0].number, title, slug, audience, contentType,
          b.body ?? null, b.keywords || "", b.portal_link || "",
          Number.isFinite(+b.sort) ? +b.sort : 0, signoff,
        ],
      ).catch(async (e: any) => {
        // Pre-20261096 schema (no signoff column yet): create without it —
        // the publish gate fails closed for tenant policy content until
        // the migration lands, so nothing slips through unpublished-gated.
        if (e?.code !== "42703") throw e;
        const retry = await c.query(
          `INSERT INTO public.doc_articles
             (tenant_id, section_id, number, title, slug, audience_slug, content_type, status, body, keywords, portal_link, sort)
           VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, 'draft', $8, NULLIF($9,''), NULLIF($10,''), COALESCE($11, 0))
           RETURNING *`,
          [
            tenant, sectionId, s.rows[0].number, title, slug, audience, contentType,
            b.body ?? null, b.keywords || "", b.portal_link || "",
            Number.isFinite(+b.sort) ? +b.sort : 0,
          ],
        );
        return { rows: retry.rows };
      });
      return rows[0];
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json({ article: out }, { status: 201 });
  } catch (e: any) {
    if (e?.statusCode === 400) return NextResponse.json({ error: e.message }, { status: 400 });
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    if (e?.code === "23505")
      return NextResponse.json({ error: "That slug is already taken for this tenant." }, { status: 409 });
    return NextResponse.json({ error: "Could not create the article." }, { status: 500 });
  }
}
