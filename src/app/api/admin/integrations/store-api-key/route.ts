import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAdminContext, requireAdminApi } from "@/lib/admin/gate";
import { deleteIntegrationKey, hashStoreApiKey, setIntegrationKey } from "@/lib/integrations/keys";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — whether a Store API key exists (the key itself is never shown again). */
export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const db = createServerClient();
  const { data } = await db
    .from("integration_keys")
    .select("id, updated_at")
    .eq("tenant_id", PLATFORM_TENANT_ID)
    .eq("key_name", "STORE_API_KEY_HASH")
    .maybeSingle();
  return NextResponse.json({ exists: Boolean(data), updatedAt: data?.updated_at ?? null });
}

/** POST — create a new Store API key (replaces any old one). Shown once. */
export async function POST() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const raw = `usk_${randomBytes(24).toString("base64url")}`;
  const ctx = await getAdminContext();
  await setIntegrationKey("STORE_API_KEY_HASH", hashStoreApiKey(raw), ctx?.userId ?? null);
  return NextResponse.json({ apiKey: raw });
}

/** DELETE — revoke the Store API key. */
export async function DELETE() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  await deleteIntegrationKey("STORE_API_KEY_HASH");
  return NextResponse.json({ ok: true });
}
