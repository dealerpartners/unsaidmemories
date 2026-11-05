import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

/**
 * Browser-side Supabase client.
 * Use this only inside Client Components (`"use client"`) or event handlers.
 * The session is persisted in cookies managed by @supabase/ssr.
 */
export function createBrowserClient() {
  return createSSRBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
