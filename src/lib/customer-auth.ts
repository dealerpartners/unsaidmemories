import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

/**
 * Resolve the signed-in customer from the Supabase session cookie.
 * Returns { supabase, user } on success, or a 401 NextResponse on failure.
 *
 * Adapted from the unsaidmemories gate pattern (requireAdminApi) — same shape,
 * but for customer sessions instead of admin API keys.
 */
export async function requireCustomer() {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Not signed in." },
        { status: 401 }
      ),
    };
  }
  return { supabase, user };
}
