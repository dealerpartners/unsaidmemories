import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/ads/advertisers/:id — the W9 suspension lever.
 * { status: 'active' | 'suspended' | 'closed' } and/or
 * { display_name }. Suspending stops the advertiser's campaigns at
 * the serving gate (serve joins ad_advertisers.status = 'active')
 * and blocks every launch transition; nothing is deleted. The
 * system (house) advertiser cannot be suspended or closed — house
 * inventory is the platform's own fill. Admin only.
 */
const STATUSES = ["active", "suspended", "closed"];

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
  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    values.push(status);
    sets.push(`status = $${values.length + 1}`);
  }
  if (body.display_name !== undefined) {
    values.push(body.display_name === null ? null : String(body.display_name));
    sets.push(`display_name = $${values.length + 1}`);
  }
  if (!sets.length) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }
  try {
    const rows = await pgQueryStrict<{ is_system: boolean }>(
      `SELECT is_system FROM public.ad_advertisers WHERE id = $1`,
      [id],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (rows[0].is_system && body.status !== undefined && body.status !== "active") {
      return NextResponse.json(
        { error: "system_advertiser_protected" },
        { status: 409 },
      );
    }
    const updated = await pgQueryStrict(
      `UPDATE public.ad_advertisers
          SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $1
        RETURNING id::text AS id, user_id, display_name, is_system, status,
                  created_at, updated_at`,
      [id, ...values],
    );
    return NextResponse.json({ advertiser: updated[0] });
  } catch {
    return NextResponse.json({ error: "advertiser_update_unavailable" }, { status: 503 });
  }
}
