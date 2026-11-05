import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { requireSupabase } from "@/lib/supabase/guard";

/**
 * POST /api/dashboard/keys/[id]/revoke
 * Marks the key as revoked (soft delete — kept for audit). The hashed_key
 * stays in the table so the gateway can still recognize attempts to use a
 * revoked key and reject them with a clear error.
 *
 * RLS policy `api_keys_update_own` ensures we can only update rows where
 * userId = auth.uid(). If the caller tries to revoke someone else's key,
 * the update affects 0 rows and we return 404.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const __sb = requireSupabase(); if (__sb) return __sb;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const supabase = await createServerClient();

  // Check the key exists + belongs to the caller (RLS scopes the query)
  const { data: key, error: findErr } = await supabase
    .from("api_keys")
    .select("id, revokedAt, label")
    .eq("id", id)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!key) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (key.revokedAt) return NextResponse.json({ ok: true }); // idempotent

  const { error: updateErr } = await supabase
    .from("api_keys")
    .update({ revokedAt: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
