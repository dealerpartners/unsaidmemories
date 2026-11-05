import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/api-keys";
import { requireSupabase } from "@/lib/supabase/guard";

/**
 * POST /api/dashboard/keys/[id]/roll
 *
 * Generates a new secret for an existing key, updates the row with the new
 * key_hash + prefix + last_four, and returns the new raw secret. The old
 * secret stops working immediately.
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

  const { data: key, error: findErr } = await supabase
    .from("api_keys")
    .select("id, name, label, revoked")
    .eq("id", id)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!key) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (key.revoked) {
    return NextResponse.json({ error: "cannot roll a revoked key" }, { status: 400 });
  }

  const { rawSecret, hashedKey, prefix, lastFour } = generateApiKey();

  const { error: updateErr } = await supabase
    .from("api_keys")
    .update({ key_hash: hashedKey, prefix, last_four: lastFour })
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ id, label: key.label ?? key.name, rawSecret });
}
