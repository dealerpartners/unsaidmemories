import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { getPayloadPool } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/website/redirects — add a redirect to Payload's
 * redirects table (admin only). Body: { from: "/old-path", to_url:
 * "/new-path" }. `from` must be a root-relative path; the target is a
 * root-relative path or an https URL. Payload's to_type enum is
 * reference|custom — admin-created redirects are always custom.
 * There is no delete route, by the owner's no-delete rule.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const body = await req.json().catch(() => null);
  const from = typeof body?.from === "string" ? body.from.trim() : "";
  const to_url = typeof body?.to_url === "string" ? body.to_url.trim() : "";
  if (!from.startsWith("/") || from.includes(" ") || !to_url || to_url.includes(" ")) {
    return NextResponse.json({ error: "from must be a path like /old-page and to_url a path or https URL" }, { status: 400 });
  }
  try {
    const { rows } = await getPayloadPool().query(
      `INSERT INTO payload.redirects ("from", to_type, to_url) VALUES ($1, 'custom', $2) RETURNING *`,
      [from, to_url],
    );
    return NextResponse.json({ redirect: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}
