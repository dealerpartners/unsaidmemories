import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/ads/creatives/:id — the W9 creative approval act.
 * { status }: 'active' approves a pending creative (serve only ever
 * reads status = 'active', so approval is the gate), 'rejected'
 * refuses it, 'paused' / 'archived' retire a live one. Only review
 * transitions are accepted here; advertiser-side edits stay on the
 * advertiser routes. Admin only.
 */
const TRANSITIONS: Record<string, string[]> = {
  pending_review: ["active", "rejected"],
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  rejected: [],
  archived: [],
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.status === undefined) {
    return NextResponse.json({ error: "status_required" }, { status: 400 });
  }
  const to = String(body.status);
  try {
    const rows = await pgQueryStrict<{ status: string }>(
      `SELECT status FROM public.ad_creatives WHERE id = $1`,
      [id],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const allowed = TRANSITIONS[rows[0].status] ?? [];
    if (!allowed.includes(to)) {
      return NextResponse.json(
        { error: "invalid_transition", from: rows[0].status, to },
        { status: 409 },
      );
    }
    const updated = await pgQueryStrict(
      `UPDATE public.ad_creatives SET status = $2 WHERE id = $1
        RETURNING id::text AS id, campaign_id::text AS campaign_id,
                  name, status`,
      [id, to],
    );
    return NextResponse.json({ creative: updated[0] });
  } catch {
    return NextResponse.json({ error: "creative_update_unavailable" }, { status: 503 });
  }
}
