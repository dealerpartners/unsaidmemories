import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/ads/rebates/:id — the W9 admin override over a
 * rebate's lifecycle. The licensee route (PATCH /api/ads/rebates) is
 * scoped to the caller's own ad account; this route is the unscoped
 * platform lever: an admin can pause or end any rebate (e.g. a policy
 * takedown) regardless of ownership. Status transitions accepted:
 * draft → active, active → paused|ended, paused → active|ended. Amount
 * and percent are NOT editable here (they change the deal economics;
 * that's an account-owner act, not an admin moderation act) — status
 * only. Admin only.
 */
const ALLOWED = ["draft", "active", "paused", "ended"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  // ad_rebates.id is a uuid — accept anything that looks like one.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
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
  if (!ALLOWED.includes(to)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  try {
    const current = await pgQueryStrict<{ status: string }>(
      `SELECT status FROM public.ad_rebates WHERE id = $1`,
      [id],
    );
    if (!current[0]) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const from = current[0].status;
    // Same transition rules the licensee side enforces, applied here
    // without the account_id filter.
    const ok =
      (from === "draft" && to === "active") ||
      (from === "active" && (to === "paused" || to === "ended")) ||
      (from === "paused" && (to === "active" || to === "ended"));
    if (!ok) {
      return NextResponse.json(
        { error: "invalid_transition", from, to },
        { status: 409 },
      );
    }
    const updated = await pgQueryStrict(
      `UPDATE public.ad_rebates
          SET status = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, status, name, rebate_type, amount, percent,
                  starts_at, ends_at, updated_at`,
      [id, to],
    );
    return NextResponse.json({ rebate: updated[0] });
  } catch {
    return NextResponse.json(
      { error: "rebate_update_unavailable" },
      { status: 503 },
    );
  }
}
