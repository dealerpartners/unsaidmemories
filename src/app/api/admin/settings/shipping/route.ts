import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgExec } from "@/lib/pg";
import { getShippingSettings, invalidateShippingSettings } from "@/lib/shipping/settings";

// GET /api/admin/settings/shipping — carrier configuration state.
// Secret VALUES are never returned; only configured flags + last-4 masks.
export async function GET(_req: NextRequest) {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;

  try {
    const s = await getShippingSettings();
    const mask = (v: string | null) =>
      v ? `••••${v.slice(-4)}` : null;
    return NextResponse.json({
      ok: true,
      defaultProvider: s.defaultProvider,
      shippo: { configured: s.shippoApiKey !== "", testMode: s.shippoTestMode, masked: mask(s.shippoApiKey || null) },
      usps: {
        configured: Boolean(s.uspsConsumerKey && s.uspsConsumerSecret),
        canBuyReal: Boolean(s.uspsConsumerKey && s.uspsConsumerSecret && s.uspsEpsAccount),
        consumerKeyMasked: mask(s.uspsConsumerKey),
        cridMasked: mask(s.uspsCrid),
        mailerIdMasked: mask(s.uspsMailerId),
        epsAccountMasked: mask(s.uspsEpsAccount),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load shipping settings" }, { status: 500 });
  }
}

// PUT /api/admin/settings/shipping — upsert shipping.* keys in app_settings.
// Body: { "shipping.shippo_api_key": "…", "shipping.label_provider": "usps", … }
// Only whitelisted keys are accepted. Empty string clears a key (sets NULL-ish).
const ALLOWED: Record<string, { label: string; secret: boolean }> = {
  "shipping.label_provider": { label: "Default label provider (shippo|usps)", secret: false },
  "shipping.shippo_api_key": { label: "Shippo API key", secret: true },
  "shipping.shippo_test_mode": { label: "Shippo test mode", secret: false },
  "shipping.usps_consumer_key": { label: "USPS OAuth2 consumer key", secret: true },
  "shipping.usps_consumer_secret": { label: "USPS OAuth2 consumer secret", secret: true },
  "shipping.usps_crid": { label: "USPS customer registration ID (CRID)", secret: true },
  "shipping.usps_mailer_id": { label: "USPS mailer ID (MID)", secret: true },
  "shipping.usps_eps_account": { label: "USPS EPS payment account number", secret: true },
};

export async function PUT(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const saved: string[] = [];

    for (const [k, meta] of Object.entries(ALLOWED)) {
      if (!(k in body)) continue;
      const raw = body[k];
      const v = (typeof raw === "string" ? raw : raw == null ? "" : String(raw)).trim();
      // Validate the provider enum.
      if (k === "shipping.label_provider" && v !== "shippo" && v !== "usps" && v !== "") {
        return NextResponse.json({ ok: false, error: `Invalid value for ${k}: must be "shippo" or "usps"` }, { status: 400 });
      }
      const jsonVal = JSON.stringify(v); // store as JSONB string
      const updated = await pgExec(
        `UPDATE app_settings SET value = $2::jsonb, description = $3, updated_at = now() WHERE key = $1`,
        [k, jsonVal, meta.label],
      );
      if (updated === 0) {
        await pgExec(
          `INSERT INTO app_settings (key, value, description, updated_at) VALUES ($1, $2::jsonb, $3, now())`,
          [k, jsonVal, meta.label],
        );
      }
      saved.push(k);
    }

    if (saved.length === 0) {
      return NextResponse.json({ ok: false, error: "No recognized shipping settings keys in request body" }, { status: 400 });
    }

    invalidateShippingSettings();
    return NextResponse.json({ ok: true, saved });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to save shipping settings" }, { status: 500 });
  }
}
