import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import {
  authenticateLicensee,
  hasScope,
  newLicenseeKey,
} from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the caller's keys (prefixes + metadata only; hashes never leave).
export async function GET(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await pgQueryStrict(
    `SELECT id::text AS id, key_prefix, name, scopes,
            last_used_at, revoked_at, created_at
       FROM public.licensee_api_keys
      WHERE advertiser_id = $1
      ORDER BY created_at ASC`,
    [auth.advertiserId],
  );
  return NextResponse.json({ keys: rows });
}

// POST — mint an additional key for the caller's account (shown once).
export async function POST(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth || !hasScope(auth, "ads:write")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const name = String(body.name ?? "Additional key").trim() || "Additional key";
  const key = newLicenseeKey();
  const rows = await pgQueryStrict<{ id: string }>(
    `INSERT INTO public.licensee_api_keys
       (advertiser_id, key_prefix, key_hash, name)
     VALUES ($1, $2, $3, $4) RETURNING id::text AS id`,
    [auth.advertiserId, key.prefix, key.hash, name],
  );
  return NextResponse.json(
    {
      id: rows[0]?.id ?? null,
      api_key: key.raw,
      key_prefix: key.prefix,
      name,
      warning: "Store this key now — it is never shown again.",
    },
    { status: 201 },
  );
}

// DELETE — revoke one of the caller's keys. Body: { id }
export async function DELETE(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth || !hasScope(auth, "ads:write")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  await pgQueryStrict(
    `UPDATE public.licensee_api_keys SET revoked_at = now()
      WHERE id = $1 AND advertiser_id = $2 AND revoked_at IS NULL`,
    [id, auth.advertiserId],
  );
  return NextResponse.json({ ok: true });
}
