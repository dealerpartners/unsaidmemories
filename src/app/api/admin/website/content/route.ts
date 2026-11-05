import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { getPayloadPool } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/website/content — the Payload-owned website content,
 * read live from the `payload` schema via direct Postgres (PostgREST
 * does not expose that schema): pages, header/footer nav items,
 * redirects, forms (+ submissions) and media. Each section is fetched
 * independently so one failing section never blanks the rest. Page
 * and form EDITING stays in the Payload admin (it owns their block
 * and version tables); this endpoint is the read side the Website
 * admin pages show, and redirects / nav / media have their own
 * write routes.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const pool = getPayloadPool();
  const out: Record<string, unknown> = {};
  const sections: [string, string][] = [
    ["pages", `SELECT id, title, slug, _status, published_at, updated_at FROM payload.pages ORDER BY updated_at DESC LIMIT 200`],
    ["header_nav", `SELECT id, _parent_id, _order, link_label, link_url, link_new_tab FROM payload.header_nav_items ORDER BY _order LIMIT 200`],
    ["footer_nav", `SELECT id, _parent_id, _order, link_label, link_url, link_new_tab FROM payload.footer_nav_items ORDER BY _order LIMIT 200`],
    ["redirects", `SELECT id, "from", to_type, to_url, updated_at FROM payload.redirects ORDER BY updated_at DESC LIMIT 200`],
    ["forms", `SELECT id, title, submit_button_label, confirmation_type, redirect_url, updated_at FROM payload.forms ORDER BY updated_at DESC LIMIT 200`],
    ["form_submissions", `SELECT id, form_id, created_at FROM payload.form_submissions ORDER BY created_at DESC LIMIT 200`],
    ["media", `SELECT id, filename, url, alt, mime_type, width, height, created_at FROM payload.media ORDER BY created_at DESC LIMIT 200`],
  ];
  for (const [key, sql] of sections) {
    try {
      const { rows } = await pool.query(sql);
      out[key] = rows;
    } catch (e) {
      out[key] = { error: e instanceof Error ? e.message : "read failed" };
    }
  }
  return NextResponse.json(out);
}
