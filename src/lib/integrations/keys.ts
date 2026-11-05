import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import { decryptValue, encryptValue, lastFour } from "./crypto";
import { ALL_KEY_NAMES } from "./catalog";

/**
 * Integration key resolution: a key she saves on the Connections
 * page (integration_keys, AES-256-GCM encrypted) wins; otherwise the
 * server's environment value is used. Short in-process cache so hot
 * paths don't hit the database per call; saving a key invalidates.
 */
const cache = new Map<string, { value: string | null; at: number }>();
const TTL_MS = 30_000;

export async function getIntegrationKey(keyName: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(keyName);
  if (hit && now - hit.at < TTL_MS) return hit.value ?? process.env[keyName] ?? "";
  let value: string | null = null;
  try {
    const db = createServerClient();
    const { data } = await db
      .from("integration_keys")
      .select("encrypted_value")
      .eq("tenant_id", PLATFORM_TENANT_ID)
      .eq("key_name", keyName)
      .maybeSingle();
    if (data?.encrypted_value) value = decryptValue(data.encrypted_value);
  } catch {
    value = null; // table unreachable — env fallback below still applies
  }
  cache.set(keyName, { value, at: now });
  return value ?? process.env[keyName] ?? "";
}

export async function setIntegrationKey(keyName: string, value: string, userId: string | null): Promise<void> {
  if (!ALL_KEY_NAMES.includes(keyName) && keyName !== "STORE_API_KEY_HASH") {
    throw new Error(`Unknown integration key: ${keyName}`);
  }
  const db = createServerClient();
  const { error } = await db.from("integration_keys").upsert(
    {
      tenant_id: PLATFORM_TENANT_ID,
      key_name: keyName,
      encrypted_value: encryptValue(value),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key_name" },
  );
  if (error) throw new Error(error.message);
  cache.delete(keyName);
}

export async function deleteIntegrationKey(keyName: string): Promise<void> {
  const db = createServerClient();
  const { error } = await db
    .from("integration_keys")
    .delete()
    .eq("tenant_id", PLATFORM_TENANT_ID)
    .eq("key_name", keyName);
  if (error) throw new Error(error.message);
  cache.delete(keyName);
}

export interface KeyStatus {
  keyName: string;
  source: "saved" | "server" | null;
  lastFour: string | null;
}

/** Statuses for the Connections page — never returns the values. */
export async function listKeyStatuses(): Promise<KeyStatus[]> {
  const db = createServerClient();
  const { data } = await db
    .from("integration_keys")
    .select("key_name, encrypted_value")
    .eq("tenant_id", PLATFORM_TENANT_ID);
  const saved = new Map<string, string>();
  for (const row of data ?? []) {
    try {
      saved.set(row.key_name, lastFour(decryptValue(row.encrypted_value)));
    } catch {
      saved.set(row.key_name, "????");
    }
  }
  return ALL_KEY_NAMES.map((keyName) => {
    if (saved.has(keyName)) return { keyName, source: "saved" as const, lastFour: saved.get(keyName)! };
    const envVal = process.env[keyName];
    if (envVal) return { keyName, source: "server" as const, lastFour: lastFour(envVal) };
    return { keyName, source: null, lastFour: null };
  });
}

/** Store API keys are stored only as a SHA-256 hash. */
export function hashStoreApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function verifyStoreApiKey(raw: string): Promise<boolean> {
  if (!raw) return false;
  try {
    const db = createServerClient();
    const { data } = await db
      .from("integration_keys")
      .select("encrypted_value")
      .eq("tenant_id", PLATFORM_TENANT_ID)
      .eq("key_name", "STORE_API_KEY_HASH")
      .maybeSingle();
    if (!data?.encrypted_value) return false;
    return decryptValue(data.encrypted_value) === hashStoreApiKey(raw);
  } catch {
    return false;
  }
}
