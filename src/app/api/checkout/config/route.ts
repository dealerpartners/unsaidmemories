import { NextResponse } from "next/server";
import { getIntegrationKey } from "@/lib/integrations/keys";
import { getAuthorizeNetConfig, isAuthorizeNetConfigured } from "@/lib/authorize-net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/checkout/config — which gateway checkout uses, plus the
// public Stripe publishable key when Stripe is the gateway.
// Publishable keys are designed to be public; the secret key never
// leaves the server. Resolution is Connections & Keys first (a key
// saved there wins) with the environment as fallback, so the
// Connections page tells the truth for the key the storefront
// actually renders with.
//
// Gateway selection (client direction 2026-11-02): when Authorize.net
// keys are saved in Connections & Keys, checkout runs on
// Authorize.net (Accept Hosted — no Stripe key needed on the page);
// otherwise Stripe, as before.
export async function GET() {
  if (await isAuthorizeNetConfigured()) {
    const cfg = await getAuthorizeNetConfig();
    // The API Login ID and Public Client Key are public by design —
    // Accept.js carries them in the page. The Transaction and
    // Signature Keys never leave the server.
    return NextResponse.json({
      gateway: "authorize_net",
      publishable_key: null,
      anet: {
        api_login_id: cfg.loginId,
        public_client_key: cfg.publicClientKey,
        accept_js_url: cfg.acceptJsUrl,
      },
    });
  }
  const key =
    (await getIntegrationKey("STRIPE_PUBLISHABLE_KEY")) ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    return NextResponse.json({ error: "Stripe publishable key not configured" }, { status: 500 });
  }
  return NextResponse.json({ gateway: "stripe", publishable_key: key });
}
