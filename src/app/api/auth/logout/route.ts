import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/logout — sign out the current user, clearing session cookies.
export async function POST() {
  try {
    const supabase = await createAuthClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/auth/logout]", err);
    return NextResponse.json(
      { error: err?.message || "Logout failed." },
      { status: 500 }
    );
  }
}
