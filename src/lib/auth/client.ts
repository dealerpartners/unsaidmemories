import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ""

export function createClient() {
  // When env keys are not set yet, construct against a placeholder so the app
  // still renders; auth calls fail gracefully until real keys are added.
  // With real keys in .env this is exactly the stock Supabase browser client.
  return createBrowserClient(
    supabaseUrl || "https://placeholder.supabase.co",
    supabaseAnonKey || "placeholder-anon-key",
  )
}
