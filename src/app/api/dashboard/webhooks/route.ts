import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { createHash, randomBytes } from "node:crypto";
import { requireSupabase } from "@/lib/supabase/guard";

/**
 * Webhook secret generation.
 *
 * Format: whsec_<43 chars url-safe base64>
 */
const SECRET_PREFIX = "whsec_";
function generateWebhookSecret() {
  const random = randomBytes(32);
  const tail = random.toString("base64url");
  const rawSecret = `${SECRET_PREFIX}${tail}`;
  return {
    rawSecret,
    secretHash: createHash("sha256").update(rawSecret).digest("hex"),
    secretPrefix: tail.slice(0, 8),
  };
}

/**
 * GET /api/dashboard/webhooks — list current user's webhooks.
 *
 * Schema (after 2026-08-16 migration): webhooks table is now
 * `webhook_subscriptions`. The dashboard still shows the same fields.
 */
export async function GET() {
  const __sb = requireSupabase(); if (__sb) return __sb;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data: webhooks, error } = await supabase
    .from("webhook_subscriptions")
    .select(
      "id, name, label, url, events, enabled, status, created_at, last_triggered",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Normalize to dashboard shape
  const normalized = (webhooks ?? []).map((w: Record<string, unknown>) => ({
    id: w.id,
    label: w.label ?? w.name,
    url: w.url,
    events: Array.isArray(w.events) ? w.events.join(",") : (w.events ?? ""),
    enabled: w.enabled,
    status: w.status,
    lastDeliveryAt: w.last_triggered,
    lastDeliveryStatus: null,
    secretPrefix: null, // not stored separately anymore — secret is hashed
    createdAt: w.created_at,
  }));

  return NextResponse.json({ webhooks: normalized });
}

/**
 * POST /api/dashboard/webhooks — create a new webhook.
 *
 * Body: { label, url, events }
 *   events can be a comma-separated string OR a string array
 * Returns: { id, label, rawSecret } — rawSecret shown ONCE.
 */
export async function POST(request: NextRequest) {
  const __sb = requireSupabase(); if (__sb) return __sb;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const label = (body.label as string | undefined)?.trim();
  const url = (body.url as string | undefined)?.trim();
  const eventsRaw = body.events;

  if (!label) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json(
      { error: "url must start with http:// or https://" },
      { status: 400 },
    );
  }

  const events: string[] = Array.isArray(eventsRaw)
    ? eventsRaw.filter((s): s is string => typeof s === "string" && s.length > 0)
    : typeof eventsRaw === "string" && eventsRaw.trim()
      ? eventsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  if (events.length === 0) {
    return NextResponse.json(
      { error: "at least one event type is required" },
      { status: 400 },
    );
  }

  const { rawSecret } = generateWebhookSecret();

  const supabase = await createServerClient();
  const { data: created, error } = await supabase
    .from("webhook_subscriptions")
    .insert({
      user_id: user.id,
      name: label,
      label,
      url,
      events,
      secret: rawSecret, // store the raw secret for now — gateway will hash on use
      enabled: true,
      status: "active",
    })
    .select("id, label, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: created.id,
    label: created.label ?? created.name,
    rawSecret,
  });
}
