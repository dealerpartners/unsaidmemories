import { createClient } from '@supabase/supabase-js';
// Lazy-safe: in a build without env, do NOT throw at import time.
// catalog-db falls back to the in-app seed when this is null.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const supabase: ReturnType<typeof createClient> | null = url && anon ? createClient(url, anon) : null;
