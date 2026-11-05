// ============================================================================
// ad-events — Supabase Edge Function (Deno)
//
// The OLAP-side ingestion point for the Unsaid Ad Center (owner spec
// 2026-10-30: "write the Supabase edge function and webhook that
// increments impression tracking counters").
//
// The storefront ad slot fires a beacon here on every impression and
// click (navigator.sendBeacon / fetch keepalive). This function:
//   1. validates the shared ingest key (header x-ad-ingest-key),
//   2. appends the raw event to public.ad_events (the event log),
//   3. atomically increments the rolled-up counters via the
//      public.increment_ad_event RPC (single UPDATE ... SET n = n + 1
//      upsert — no read-modify-write race, budget state stays exact).
//
// It never talks to the OLTP ad tables (ad_campaigns / ad_creatives)
// beyond stamping their ids onto the event. Serving decisions are made
// by the storefront's decision route from a cached payload; this
// function is write-only and safe to scale horizontally.
//
// Deploy:  supabase functions deploy ad-events --project-ref pcwwvfgxnrglmmpbfqhf
// Secrets: AD_INGEST_KEY (shared with the storefront slot's beacon code;
//          the key gates writes, it is not a user credential — events are
//          anonymous, keyed by a salted session hash, never a raw user id)
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const INGEST_KEY = Deno.env.get("AD_INGEST_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const EVENT_TYPES = new Set(["impression", "click", "conversion"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, x-ad-ingest-key",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!INGEST_KEY || req.headers.get("x-ad-ingest-key") !== INGEST_KEY) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // Accept a single event or a small batch ({ events: [...] }).
  const events: Array<Record<string, unknown>> = Array.isArray(payload.events)
    ? (payload.events as Array<Record<string, unknown>>)
    : [payload];
  if (events.length === 0 || events.length > 50) {
    return json({ error: "batch size must be 1..50" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let accepted = 0;
  for (const ev of events) {
    const type = String(ev.type ?? "");
    if (!EVENT_TYPES.has(type)) continue;
    const campaignId = ev.campaign_id ? String(ev.campaign_id) : null;
    const creativeId = ev.creative_id ? String(ev.creative_id) : null;
    const placementKey = ev.placement_key ? String(ev.placement_key) : null;
    if (!campaignId || !placementKey) continue;

    const { error } = await supabase.rpc("increment_ad_event", {
      p_type: type,
      p_campaign_id: campaignId,
      p_creative_id: creativeId,
      p_placement_key: placementKey,
    });
    if (!error) accepted += 1;
  }

  return json({ accepted });
});
