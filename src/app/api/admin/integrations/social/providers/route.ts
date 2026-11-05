import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdminApi, TENANT_ID } from "@/lib/admin/gate";
import { SOCIAL_PROVIDERS, getProviderCredentials } from "@/lib/integrations/providers";
import { encryptValue, lastFour } from "@/lib/integrations/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/integrations/social/providers — every network, whether its
// OAuth app is configured, and how many accounts are connected.
export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const db = createServerClient();
  const { data: accounts } = await db
    .from("social_accounts")
    .select("network, status")
    .eq("tenant_id", TENANT_ID);
  const providers: Array<{
    id: string;
    label: string;
    blurb: string;
    color: string;
    scopes: string[];
    captionLimit: number;
    configured: boolean;
    credentialSource: "env" | "settings" | null;
    envKeys: string[];
    connectedAccounts: number;
  }> = [];
  for (const p of SOCIAL_PROVIDERS) {
    const creds = await getProviderCredentials(p);
    providers.push({
      id: p.id,
      label: p.label,
      blurb: p.blurb,
      color: p.color,
      scopes: p.scopes,
      captionLimit: p.captionLimit,
      configured: !!creds,
      credentialSource: creds?.source ?? null,
      envKeys: [p.envClientId, p.envClientSecret],
      connectedAccounts: (accounts ?? []).filter(
        (a) => a.network === p.id && a.status === "connected"
      ).length,
    });
  }
  return NextResponse.json({ providers });
}

// POST /api/admin/integrations/social/providers — save a network's OAuth app
// credentials into integration_secrets (encrypted). Body: { network, clientId, clientSecret }.
export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const provider = SOCIAL_PROVIDERS.find((p) => p.id === body.network);
  if (!provider) return NextResponse.json({ error: "Unknown network." }, { status: 400 });
  const clientId = String(body.clientId ?? "").trim();
  const clientSecret = String(body.clientSecret ?? "").trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Both client id and client secret are required." }, { status: 400 });
  }
  const db = createServerClient();
  const rows = [
    { field_key: "client_id", value: clientId },
    { field_key: "client_secret", value: clientSecret },
  ].map((r) => ({
    service_key: `social_${provider.id}`,
    field_key: r.field_key,
    service_name: provider.label,
    category: "social",
    label: `${provider.label} OAuth ${r.field_key === "client_id" ? "Client ID" : "Client Secret"}`,
    value_encrypted: encryptValue(r.value),
    last_four: lastFour(r.value),
    is_set: true,
    updated_at: new Date().toISOString(),
    updated_by: "admin-integrations",
  }));
  const { error } = await db
    .from("integration_secrets")
    .upsert(rows, { onConflict: "service_key,field_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, network: provider.id });
}
