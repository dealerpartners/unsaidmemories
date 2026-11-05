import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { createServiceClient } from "@/lib/social/host";
import { encryptToText } from "@/lib/social/crypto/vault";
import { PLATFORM_CONFIG, type PlatformId } from "@/lib/social/platforms/config";
import { getOperatorKeys, missingKeyFields } from "@/lib/social/platforms/operator-keys";
import { callbackUrl } from "@/lib/social/platforms/config";

export const dynamic = "force-dynamic";

// /api/admin/social/platform-keys — operator (platform) app credentials.
// Admin gate + 'social' module at full level. Secrets are stored encrypted
// (social_platform_apps ciphertext columns) and NEVER returned — GET
// reports only which fields are set. Blank field on PUT = keep existing.
async function gate() {
  return requireModuleApi("social", "full");
}

export async function GET() {
  const denied = await gate();
  if (denied) return denied;
  const platforms = await Promise.all(
    (Object.keys(PLATFORM_CONFIG) as PlatformId[]).map(async (id) => {
      const cfg = PLATFORM_CONFIG[id];
      const keys = await getOperatorKeys(id);
      return {
        id, label: cfg.label, db: cfg.db, capability: cfg.capability,
        authType: cfg.authType, fields: cfg.adminKeys.map((f) => ({ key: f.key, label: f.label, secret: f.secret, set: Boolean(keys[f.key]) })),
        configured: missingKeyFields(id, keys).length === 0,
        callbackUrl: cfg.oauth ? callbackUrl(id) : null,
      };
    }),
  );
  return NextResponse.json({ platforms });
}

export async function PUT(req: NextRequest) {
  const denied = await gate();
  if (denied) return denied;
  const body = await req.json().catch(() => null) as { platform?: string; values?: Record<string, string>; clear?: boolean } | null;
  const cfg = body?.platform ? PLATFORM_CONFIG[body.platform as PlatformId] : undefined;
  if (!cfg || !body) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  const admin = createServiceClient();
  if (body.clear) {
    const { error } = await admin.from("social_platform_apps").delete().eq("platform", cfg.db);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cleared: true });
  }
  const values = body.values ?? {};
  const clientId = (values.clientId ?? "").trim();
  const primarySecretField = cfg.adminKeys.find((f) => f.secret)?.key ?? "clientSecret";
  const primarySecret = (values[primarySecretField] ?? "").trim();
  const extra: Record<string, string> = {};
  for (const f of cfg.adminKeys) {
    if (f.key === "clientId" || f.key === primarySecretField) continue;
    const v = (values[f.key] ?? "").trim();
    if (v) extra[f.key] = v;
  }
  const row: Record<string, unknown> = { platform: cfg.db, updated_at: new Date().toISOString() };
  if (clientId) row.client_id = clientId;
  if (primarySecret) row.client_secret_ciphertext = encryptToText(primarySecret);
  if (Object.keys(extra).length) row.extra_ciphertext = encryptToText(JSON.stringify(extra));
  const { error } = await admin.from("social_platform_apps").upsert(row, { onConflict: "platform" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const keys = await getOperatorKeys(cfg.id);
  return NextResponse.json({ ok: true, configured: missingKeyFields(cfg.id, keys).length === 0 });
}
