import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/webhooks/ad-events — the Next-side ad counter webhook.
//
// The shop-page slot's viewability beacon posts here; this route
// validates the event (type, and the creative really belongs to the
// campaign) and then increments the SAME counters as the Supabase Edge
// Function `ad-events`: one call to the increment_ad_event RPC appends
// the raw ad_events row (partitioned event log) and atomically bumps
// ad_event_counters + ad_campaign_daily. Two writers, one counter
// truth — never two counter implementations.
//
// This webhook is separate from the Stripe checkout webhook (whose
// secret is a W6/W7 item); it needs no Stripe secret and is not
// blocked by it. A single event or a batch { events: [...] } (max 50)
// is accepted, mirroring the edge function contract.
// Body event: { type: "impression"|"click"|"conversion",
//   campaign_id, creative_id?, placement }
// where placement is the placement CODE (e.g. "plp_in_grid").
// ============================================================================

const EVENT_TYPES = new Set(["impression", "click", "conversion"]);

async function countOne(ev: Record<string, unknown>): Promise<boolean> {
  const type = String(ev.type ?? "");
  if (!EVENT_TYPES.has(type)) return false;
  const campaignId = Number(ev.campaign_id);
  const creativeId = ev.creative_id != null ? Number(ev.creative_id) : null;
  const placement = ev.placement != null ? String(ev.placement) : "";
  if (!Number.isFinite(campaignId) || campaignId <= 0 || !placement) {
    return false;
  }
  // The creative must exist and belong to the named campaign; anything
  // else is refused rather than counted against a stranger's campaign.
  if (creativeId != null && Number.isFinite(creativeId)) {
    const owned = await pgQueryStrict(
      `SELECT id FROM public.ad_creatives
        WHERE id = $1 AND campaign_id = $2 LIMIT 1`,
      [creativeId, campaignId],
    );
    if (!owned[0]) return false;
  }
  await pgQueryStrict(`SELECT public.increment_ad_event($1, $2, $3, $4)`, [
    type,
    campaignId,
    creativeId,
    placement,
  ]);
  return true;
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const events: Array<Record<string, unknown>> = Array.isArray(body.events)
    ? (body.events as Array<Record<string, unknown>>)
    : [body];
  if (events.length === 0 || events.length > 50) {
    return NextResponse.json(
      { error: "batch size must be 1..50" },
      { status: 400 },
    );
  }
  let accepted = 0;
  for (const ev of events) {
    try {
      if (await countOne(ev)) accepted += 1;
    } catch {
      // One bad event never fails the batch; the counter RPC is the
      // only writer, so a failed event simply is not counted.
    }
  }
  return NextResponse.json({ accepted });
}
