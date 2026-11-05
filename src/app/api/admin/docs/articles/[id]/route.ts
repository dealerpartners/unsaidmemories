import { NextRequest, NextResponse } from "next/server";
import { withPg } from "@/lib/crm/enterprise";
import {
  requireDocs, resolveTenantId, isMissingTable, DOCS_SCHEMA_MSG,
  DOCS_CONTENT_TYPES, slugify, docsAudit, masterTenantId,
} from "@/lib/admin/docs-store";

export const dynamic = "force-dynamic";

// Draft-editable fields. number + section_id are READ-ONLY (derived from the
// section at create; renumbering is a migration, never UI). status changes go
// through publish / retire / restore — never here.
const EDITABLE = [
  "title", "slug", "audience_slug", "content_type",
  "body", "keywords", "portal_link", "sort",
] as const;

// GET /api/admin/docs/articles/[id] -> one article (any status).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireDocs(req, "read");
  if (denied) return denied;
  const { id } = await params;
  const tenant = resolveTenantId(req);
  try {
    const rows = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT a.*,
                s.number AS section_number, s.title AS section_title, s.slug AS section_slug,
                d.slug AS domain_slug, d.title AS domain_title
           FROM public.doc_articles a
           LEFT JOIN public.doc_sections s ON s.id = a.section_id AND s.tenant_id = a.tenant_id
           LEFT JOIN public.doc_domains d ON d.id = s.domain_id AND d.tenant_id = a.tenant_id
          WHERE a.tenant_id = $1 AND a.id = $2::uuid`,
        [tenant, id],
      );
      return rows;
    });
    if (!rows) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!rows.length) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ article: rows[0] });
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not load the article." }, { status: 500 });
  }
}

// PATCH /api/admin/docs/articles/[id] -> update draft fields (also the 30s autosave).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireDocs(req, "write");
  if (denied) return denied;
  const { id } = await params;
  const tenant = resolveTenantId(req);
  const b = await req.json().catch(() => ({}));

  const sets: string[] = [];
  const vals: any[] = [tenant, id];
  const push = (col: string, val: any) => {
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  };

  for (const key of EDITABLE) {
    if (!(key in b)) continue;
    const v = b[key];
    if (key === "slug") {
      const s = slugify(String(v || ""));
      if (!s) return NextResponse.json({ error: "Slug is required." }, { status: 400 });
      push("slug", s);
    } else if (key === "title") {
      const t = String(v || "").trim();
      if (!t) return NextResponse.json({ error: "Title is required." }, { status: 400 });
      push("title", t);
    } else if (key === "content_type") {
      if (!DOCS_CONTENT_TYPES.includes(v))
        return NextResponse.json({ error: "Unknown content type." }, { status: 400 });
      push("content_type", v);
    } else if (key === "sort") {
      push("sort", Number.isFinite(+v) ? +v : 0);
    } else if (key === "keywords" || key === "portal_link") {
      push(key, String(v || "").trim() || null);
    } else if (key === "audience_slug") {
      push(key, String(v || "").trim() || "buyer");
    } else {
      push(key, v ?? null);
    }
  }
  if (!sets.length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  try {
    const out = await withPg(async (c) => {
      // Audience must stay one of the seeded values when provided.
      if ("audience_slug" in b) {
        const a = await c.query(
          `SELECT 1 FROM public.doc_audiences WHERE tenant_id = $1 AND slug = $2`,
          [tenant, String(b.audience_slug || "").trim() || "buyer"],
        );
        if (!a.rows.length) throw Object.assign(new Error("Unknown audience."), { statusCode: 400 });
      }
      const { rows } = await c.query(
        `UPDATE public.doc_articles SET ${sets.join(", ")}, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING *`,
        vals,
      );
      const article = rows[0] || null;
      // S4: editing the title/body of a tenant policy article after
      // master approval returns it to 'pending' — the approval covered
      // the earlier text, not this one. (Guarded: pre-20261096 schemas
      // have no signoff column; the publish gate fails closed there.)
      if (article && article.content_type === "policy" && ("title" in b || "body" in b)) {
        const masterId = await masterTenantId(c);
        if (masterId && tenant !== masterId && article.signoff_status === "approved") {
          const upd = await c.query(
            `UPDATE public.doc_articles SET signoff_status = 'pending', signoff_by = NULL, signoff_at = NULL
              WHERE tenant_id = $1 AND id = $2::uuid RETURNING *`,
            [tenant, id],
          ).catch((e: any) => {
            // Pre-20261096 schemas have no signoff column (42703) — the
            // reset is inapplicable there; every other failure surfaces.
            if (e?.code === "42703") return null;
            throw e;
          });
          if (upd?.rows[0]) return { article: upd.rows[0] };
        }
      }
      return { article };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!out.article) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ article: out.article });
  } catch (e: any) {
    if (e?.statusCode === 400) return NextResponse.json({ error: e.message }, { status: 400 });
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    if (e?.code === "23505")
      return NextResponse.json({ error: "That slug is already taken for this tenant." }, { status: 409 });
    return NextResponse.json({ error: "Could not update the article." }, { status: 500 });
  }
}

// DELETE /api/admin/docs/articles/[id] -> docs.manage may delete DRAFTS ONLY.
// Published/retired articles are retired, never deleted.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireDocs(req, "manage");
  if (denied) return denied;
  const { id } = await params;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const cur = await c.query(
        `SELECT id, status, title, slug FROM public.doc_articles WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id],
      );
      const row = cur.rows[0];
      if (!row) return { notFound: true as const };
      if (row.status !== "draft")
        return { forbidden: true as const, status: row.status };
      await c.query(`DELETE FROM public.doc_articles WHERE tenant_id = $1 AND id = $2::uuid`, [tenant, id]);
      return { deleted: true as const, row };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ("notFound" in out) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if ("forbidden" in out)
      return NextResponse.json(
        { error: `Only drafts can be deleted — retire this ${out.status} article instead.` },
        { status: 409 },
      );
    await docsAudit({
      tenant, action: "article.delete_draft", entityType: "article", entityId: id,
      before: out.row, req,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not delete the article." }, { status: 500 });
  }
}
