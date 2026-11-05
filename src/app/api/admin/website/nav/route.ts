import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { getPayloadPool } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/website/nav — add a header or footer nav item to
 * Payload's nav tables (admin only). Body: { section: "header" |
 * "footer", label, url, new_tab? }. The item is appended after the
 * current last item of the singleton header/footer row. There is no
 * delete route, by the owner's no-delete rule.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const body = await req.json().catch(() => null);
  const section = body?.section === "footer" ? "footer" : body?.section === "header" ? "header" : null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!section || !label || !url || url.includes(" ")) {
    return NextResponse.json({ error: "section (header/footer), label and url are required" }, { status: 400 });
  }
  try {
    const pool = getPayloadPool();
    const table = section === "header" ? "payload.header_nav_items" : "payload.footer_nav_items";
    const parentTable = section === "header" ? "payload.header" : "payload.footer";
    const { rows: parents } = await pool.query(`SELECT id FROM ${parentTable} ORDER BY id LIMIT 1`);
    if (!parents[0]) {
      return NextResponse.json({ error: `No Payload ${section} row exists yet — create it in the Payload admin first` }, { status: 409 });
    }
    const pid = parents[0].id;
    const { rows: last } = await pool.query(`SELECT _order FROM ${table} WHERE _parent_id = $1 ORDER BY _order DESC LIMIT 1`, [pid]);
    const order = (last[0]?._order ?? 0) + 1;
    const { rows } = await pool.query(
      `INSERT INTO ${table} (_parent_id, _order, link_type, link_label, link_url, link_new_tab) VALUES ($1, $2, 'custom', $3, $4, $5) RETURNING *`,
      [pid, order, label, url, body?.new_tab === true],
    );
    return NextResponse.json({ item: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}
