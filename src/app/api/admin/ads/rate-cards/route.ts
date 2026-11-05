import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * /api/admin/ads/rate-cards — W9 rate-card management (spec section
 * 10). GET lists every card with its tier x placement items. POST
 * creates a card ({ name }) or upserts an item
 * ({ rate_card_id, tier_id, placement_id, cpm_cents, active? }).
 * PATCH { id, active } toggles a card.
 *
 * Editing a card NEVER re-prices a launched campaign: serve reads
 * only the per-placement snapshot in ad_campaign_rates, written at
 * launch (spec section 11). Admin only.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const [cards, items] = await Promise.all([
      pgQueryStrict(
        `SELECT id, name, active, created_at FROM public.ad_rate_cards
          ORDER BY id ASC`,
      ),
      pgQueryStrict(
        `SELECT i.id::text AS id, i.rate_card_id, i.tier_id,
                t.code AS tier_code, i.placement_id,
                p.code AS placement_code, i.cpm_cents, i.active
           FROM public.ad_rate_card_items i
           JOIN public.ad_tiers t ON t.id = i.tier_id
           JOIN public.ad_placements p ON p.id = i.placement_id
          ORDER BY i.rate_card_id, t.priority, p.code`,
      ),
    ]);
    return NextResponse.json({ cards, items });
  } catch {
    return NextResponse.json({ error: "rate_cards_unavailable" }, { status: 503 });
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
  try {
    if (body.cpm_cents !== undefined) {
      const rateCardId = Number(body.rate_card_id);
      const tierId = Number(body.tier_id);
      const placementId = Number(body.placement_id);
      const cpm = Number(body.cpm_cents);
      if (
        !Number.isInteger(rateCardId) || !Number.isInteger(tierId) ||
        !Number.isInteger(placementId) || !Number.isInteger(cpm) || cpm < 0
      ) {
        return NextResponse.json({ error: "invalid_item" }, { status: 400 });
      }
      const rows = await pgQueryStrict(
        `INSERT INTO public.ad_rate_card_items
           (rate_card_id, tier_id, placement_id, cpm_cents, active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (rate_card_id, tier_id, placement_id) DO UPDATE
           SET cpm_cents = EXCLUDED.cpm_cents, active = EXCLUDED.active
         RETURNING id::text AS id, rate_card_id, tier_id, placement_id,
                   cpm_cents, active`,
        [rateCardId, tierId, placementId, cpm, body.active !== false],
      );
      return NextResponse.json({ item: rows[0] });
    }
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name_required" }, { status: 400 });
    }
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_rate_cards (name, active) VALUES ($1, $2)
       RETURNING id, name, active, created_at`,
      [name, body.active !== false],
    );
    return NextResponse.json({ card: rows[0] });
  } catch {
    return NextResponse.json({ error: "rate_card_write_unavailable" }, { status: 503 });
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
  if (!Number.isInteger(id) || body.active === undefined) {
    return NextResponse.json({ error: "invalid_card" }, { status: 400 });
  }
  try {
    const rows = await pgQueryStrict(
      `UPDATE public.ad_rate_cards SET active = $2 WHERE id = $1
       RETURNING id, name, active, created_at`,
      [id, body.active === true],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ card: rows[0] });
  } catch {
    return NextResponse.json({ error: "rate_card_write_unavailable" }, { status: 503 });
  }
}
