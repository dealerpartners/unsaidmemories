import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * /api/admin/ads/placements — W9 placement management (spec section
 * 4: placements are data, never hard-coded into serving). GET lists
 * the inventory with live campaign counts. POST creates a placement
 * ({ code, name, max_per_page }). PATCH { id, active?, max_per_page?,
 * name? } edits one. The retired shop_grid_top is not in the v2
 * inventory and is never recreated here. Admin only.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const placements = await pgQueryStrict(
      `SELECT p.id, p.code, p.name, p.max_per_page, p.active,
              count(DISTINCT cp.campaign_id)::int AS campaigns,
              COALESCE(sum(td.impressions),0)::bigint AS impressions_today
         FROM public.ad_placements p
         LEFT JOIN public.ad_campaign_placements cp
           ON cp.placement_id = p.id
         LEFT JOIN public.ad_events td
           ON td.placement_id = p.id
          AND td.event_type = 'impression'
          AND td.event_time >= CURRENT_DATE
        GROUP BY p.id
        ORDER BY p.id ASC`,
    );
    return NextResponse.json({ placements });
  } catch {
    return NextResponse.json({ error: "placements_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const code = String(body.code ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const maxPerPage = Number(body.max_per_page ?? 1);
  if (!/^[a-z0-9_]+$/.test(code) || !name || !Number.isInteger(maxPerPage) || maxPerPage < 1) {
    return NextResponse.json({ error: "invalid_placement" }, { status: 400 });
  }
  if (code === "shop_grid_top") {
    return NextResponse.json({ error: "placement_retired" }, { status: 409 });
  }
  try {
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_placements (code, name, max_per_page, active)
       VALUES ($1, $2, $3, true)
       RETURNING id, code, name, max_per_page, active`,
      [code, name, maxPerPage],
    );
    return NextResponse.json({ placement: rows[0] });
  } catch {
    return NextResponse.json({ error: "placement_create_unavailable" }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid_placement" }, { status: 400 });
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.active !== undefined) {
    values.push(body.active === true);
    sets.push(`active = $${values.length + 1}`);
  }
  if (body.max_per_page !== undefined) {
    const n = Number(body.max_per_page);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "invalid_max_per_page" }, { status: 400 });
    }
    values.push(n);
    sets.push(`max_per_page = $${values.length + 1}`);
  }
  if (body.name !== undefined) {
    values.push(String(body.name));
    sets.push(`name = $${values.length + 1}`);
  }
  if (!sets.length) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }
  try {
    const rows = await pgQueryStrict(
      `UPDATE public.ad_placements SET ${sets.join(", ")} WHERE id = $1
       RETURNING id, code, name, max_per_page, active`,
      [id, ...values],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ placement: rows[0] });
  } catch {
    return NextResponse.json({ error: "placement_update_unavailable" }, { status: 503 });
  }
}
