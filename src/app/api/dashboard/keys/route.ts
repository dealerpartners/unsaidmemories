import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { hashApiKey, generateApiKey } from "@/lib/api-keys";
import { requireSupabase } from "@/lib/supabase/guard";

/**
 * GET /api/dashboard/keys — list current user's API keys (no raw secrets)
 *
 * Schema (after 2026-08-16 migration):
 *   api_keys (id, organization_id, user_id, name, label, key_hash, prefix,
 *             last_four, scopes TEXT[], last_used, last_used_ip, expires_at,
 *             revoked BOOLEAN, revoked_at, created_at, updated_at)
 *
 * The dashboard uses the user's Supabase session (RLS-protected) so the
 * query is automatically scoped to rows where user_id = auth.uid().
 */
export async function GET() {
  const __sb = requireSupabase(); if (__sb) return __sb;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createServerClient();
  const { data: keys, error } = await supabase
    .from("api_keys")
    .select(
      "id, name, label, prefix, last_four, scopes, revoked, revoked_at, expires_at, last_used, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Normalize to the shape the dashboard UI expects (camelCase + flat scopes string)
  const normalized = (keys ?? []).map((k: Record<string, unknown>) => ({
    id: k.id,
    label: k.label ?? k.name,
    prefix: k.prefix,
    lastFour: k.last_four,
    scopes: Array.isArray(k.scopes) ? k.scopes.join(",") : (k.scopes ?? ""),
    revoked: k.revoked,
    revokedAt: k.revoked_at,
    expiresAt: k.expires_at,
    lastUsedAt: k.last_used,
    createdAt: k.created_at,
  }));

  return NextResponse.json({ keys: normalized });
}

/**
 * POST /api/dashboard/keys — create a new API key
 * Body: { label: string, scopes?: string | string[], expiresAt?: string | null }
 *
 * Returns the raw secret ONCE. Client must store it; we never persist it.
 */
export async function POST(request: NextRequest) {
  const __sb = requireSupabase(); if (__sb) return __sb;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const label = (body.label as string | undefined)?.trim();
  const scopesRaw = body.scopes;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt as string) : null;

  if (!label) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  if (expiresAt && isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: "expiresAt is not a valid ISO date" }, { status: 400 });
  }

  // Normalize scopes to an array of strings
  const scopes: string[] = Array.isArray(scopesRaw)
    ? scopesRaw.filter((s): s is string => typeof s === "string" && s.length > 0)
    : typeof scopesRaw === "string" && scopesRaw.trim()
      ? scopesRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : ["catalog_read", "catalog_write", "analytics_read"];

  // Generate the raw secret + its hash + display prefix/last4
  const { rawSecret, hashedKey, prefix, lastFour } = generateApiKey();

  const supabase = await createServerClient();

  const { data: created, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: label,
      label,
      key_hash: hashedKey,
      prefix,
      last_four: lastFour,
      scopes,
      expires_at: expiresAt?.toISOString() ?? null,
      revoked: false,
    })
    .select("id, label, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: created.id,
    label: created.label ?? created.name,
    rawSecret, // the full `sk_live_<random>` — client must store
  });
}
