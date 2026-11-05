import { NextResponse } from "next/server";
import { getPgWithRetry } from "@/lib/pg";
import {
  authenticateLicensee,
  newLicenseeKey,
} from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/licensee/accounts — self-serve signup. No prior key
// needed: creates the OLTP ad_advertisers row, the licensee account
// wrapping it, and the account's first API key, returned ONCE.
// Body: { display_name, contact_email }
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const displayName = String(body.display_name ?? "").trim();
  const contactEmail = String(body.contact_email ?? "").trim();
  if (!displayName || !contactEmail.includes("@")) {
    return NextResponse.json(
      { error: "display_name and a valid contact_email are required" },
      { status: 400 },
    );
  }
  const key = newLicenseeKey();
  const client = await getPgWithRetry();
  try {
    await client.query("BEGIN");
    // Licensee accounts authenticate by API key, not by a Supabase
    // session — but the OLTP schema requires every non-system
    // advertiser to carry a UNIQUE user_id (identity check:
    // is_system OR user_id IS NOT NULL; one-system uniqueness forbids
    // sharing the single system row, and user_id itself is unique).
    // There is no FK from user_id to auth.users, so the anchor is a
    // fresh uuid per account: the account's real credential remains
    // its licensee API key, and the anchor is never used for login.
    const adv = await client.query<{ id: string }>(
      `INSERT INTO public.ad_advertisers (display_name, status, is_system, user_id)
       VALUES ($1, 'active', false, gen_random_uuid()) RETURNING id::text AS id`,
      [displayName],
    );
    const adAdvertiserId = adv.rows[0].id;
    const lic = await client.query<{ id: string }>(
      `INSERT INTO public.licensee_advertisers
         (ad_advertiser_id, display_name, contact_email, status)
       VALUES ($1, $2, $3, 'active') RETURNING id::text AS id`,
      [adAdvertiserId, displayName, contactEmail],
    );
    const advertiserId = lic.rows[0].id;
    await client.query(
      `INSERT INTO public.licensee_api_keys
         (advertiser_id, key_prefix, key_hash, name)
       VALUES ($1, $2, $3, 'Default key')`,
      [advertiserId, key.prefix, key.hash],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      {
        advertiser_id: advertiserId,
        ad_advertiser_id: adAdvertiserId,
        display_name: displayName,
        contact_email: contactEmail,
        api_key: key.raw,
        key_prefix: key.prefix,
        warning: "Store this key now — it is never shown again.",
      },
      { status: 201 },
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("licensee signup failed", err);
    return NextResponse.json({ error: "signup_unavailable" }, { status: 503 });
  } finally {
    client.release();
  }
}

// GET /api/v1/licensee/accounts — the caller's own account (key auth).
export async function GET(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    advertiser_id: auth.advertiserId,
    ad_advertiser_id: auth.adAdvertiserId,
    display_name: auth.displayName,
    contact_email: auth.contactEmail,
    status: "active",
  });
}

// PATCH — rename / change contact email (key auth, own account only).
export async function PATCH(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const displayName =
    body.display_name != null ? String(body.display_name).trim() : null;
  const contactEmail =
    body.contact_email != null ? String(body.contact_email).trim() : null;
  if (!displayName && !contactEmail) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }
  const client = await getPgWithRetry();
  try {
    await client.query("BEGIN");
    if (displayName) {
      await client.query(
        `UPDATE public.licensee_advertisers SET display_name = $2, updated_at = now() WHERE id = $1`,
        [auth.advertiserId, displayName],
      );
      await client.query(
        `UPDATE public.ad_advertisers SET display_name = $2, updated_at = now() WHERE id = $1`,
        [auth.adAdvertiserId, displayName],
      );
    }
    if (contactEmail) {
      await client.query(
        `UPDATE public.licensee_advertisers SET contact_email = $2, updated_at = now() WHERE id = $1`,
        [auth.advertiserId, contactEmail],
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json({ error: "update_failed" }, { status: 503 });
  } finally {
    client.release();
  }
}
