import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/customers/me — current customer profile.
// Merges Supabase Auth user + public.profiles row.
export async function GET() {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name, active_tenant_id, created_at")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name:
        profile?.display_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.display_name ||
        null,
      avatarUrl: user.user_metadata?.avatar_url || null,
      emailConfirmed: !!user.email_confirmed_at,
      memberSince: profile?.created_at || user.created_at,
    });
  } catch (err: any) {
    console.error("[GET /api/customers/me]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load profile." },
      { status: 500 }
    );
  }
}

// PATCH /api/customers/me — update customer profile.
// Body: { name? } — updates auth user_metadata + profiles.display_name.
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const body = await req.json().catch(() => null);
    const name =
      body?.name !== undefined ? String(body.name).trim() : undefined;

    if (name !== undefined && !name) {
      return NextResponse.json(
        { error: "Name cannot be empty." },
        { status: 400 }
      );
    }

    if (name !== undefined) {
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { full_name: name, display_name: name },
      });
      if (metaErr) {
        return NextResponse.json({ error: metaErr.message }, { status: 400 });
      }
      await supabase
        .from("profiles")
        .upsert({ id: user.id, display_name: name }, { onConflict: "id" });
    }

    return NextResponse.json({ success: true, name: name ?? null });
  } catch (err: any) {
    console.error("[PATCH /api/customers/me]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to update profile." },
      { status: 500 }
    );
  }
}
