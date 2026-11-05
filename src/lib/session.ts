import { createServerClient } from "@/lib/supabase/server";

/**
 * Returns the current Supabase user, or null if not authenticated.
 * Server-only. Use inside Server Components / Route Handlers / Server Actions.
 *
 * No Prisma. The Supabase server client reads the session cookie via
 * next/headers and refreshes it if needed. The user object comes straight
 * from auth.users — no separate developer_profiles table needed.
 */
export async function getCurrentUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the current user, throwing a redirect to /signin if not authenticated.
 * Use at the top of any /dashboard/* Server Component.
 *
 * Usage:
 *   const user = await requireUser();
 *
 * We import NextResponse lazily to avoid bundling next/server into client.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const { redirect } = await import("next/navigation");
    redirect("/signin?next=" + encodeURIComponent(
      // We don't have access to the pathname here; middleware already set it.
      "/dashboard",
    ));
  }
  return user;
}

// NOTE: ensureDeveloperProfile() has been removed.
// The old pattern of a separate `developer_profiles` table synced via Prisma
// upsert on every dashboard mount was a decade-old antipattern. Modern
// Supabase apps put profile fields directly on auth.users via the
// `raw_user_meta_data` JSONB column (or `raw_app_meta_data` for server-only
// fields). No sync, no separate table, no Prisma.
//
// To read profile fields:
//   const user = await getCurrentUser();
//   const displayName = user.user_metadata?.display_name ?? null;
//
// To write profile fields (server-side):
//   const supabase = await createServerClient();
//   await supabase.auth.updateUser({ data: { display_name: "..." } });
