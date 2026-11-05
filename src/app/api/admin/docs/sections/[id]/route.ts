import { NextRequest, NextResponse } from "next/server";
import { withPg } from "@/lib/crm/enterprise";
import {
  requireDocs, resolveTenantId, isMissingTable, DOCS_SCHEMA_MSG, docsAudit,
} from "@/lib/admin/docs-store";

export const dynamic = "force-dynamic";

// PATCH /api/admin/docs/sections/[id] — section metadata (title, description,
// sort). docs.manage only. number/parent/domain are NOT editable here —
// renumbering and reparenting are migrations, never UI edits.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireDocs(req, "manage");
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
  if ("title" in b) {
    const t = String(b.title || "").trim();
    if (!t) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    push("title", t);
  }
  if ("description" in b) push("description", String(b.description || "").trim() || null);
  if ("sort" in b) push("sort", Number.isFinite(+b.sort) ? +b.sort : 0);
  if (!sets.length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `UPDATE public.doc_sections SET ${sets.join(", ")}
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING *`,
        vals,
      );
      return { section: rows[0] || null };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (!out.section) return NextResponse.json({ error: "Not found." }, { status: 404 });
    await docsAudit({
      tenant, action: "section.update", entityType: "section", entityId: id,
      after: b, req,
    });
    return NextResponse.json({ section: out.section });
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not update the section." }, { status: 500 });
  }
}
