import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { authenticateLicensee } from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the rate card, read-only: every active card with its per-tier,
// per-placement direct cost (CPM cents). Campaigns choose one of these
// costs; the chosen cpm is snapshotted onto the campaign rate at
// publish time, so later card edits never rewrite live delivery cost.
// NOTE (sequencing): no test rate card is created here — admin creates
// rate cards; this route only reads. A test-named card is created only
// after the W7 ad-config wipe relay, or flagged as a caveat if it
// never arrives.
export async function GET(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cards = await pgQueryStrict(
    `SELECT id, name, active FROM public.ad_rate_cards
      WHERE active = true ORDER BY id ASC`,
  );
  const items = await pgQueryStrict(
    `SELECT i.id, i.rate_card_id, t.code AS tier_code,
            p.code AS placement_code, p.name AS placement_name,
            i.cpm_cents
       FROM public.ad_rate_card_items i
       JOIN public.ad_tiers t ON t.id = i.tier_id
       JOIN public.ad_placements p ON p.id = i.placement_id
      WHERE i.active = true
      ORDER BY i.rate_card_id, t.priority, p.id`,
  );
  return NextResponse.json({ rate_cards: cards, items });
}
