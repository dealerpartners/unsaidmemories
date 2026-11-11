'use client';

import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/** Browser-side Supabase Auth client (login page: Google OAuth start). */
export function createAuthBrowserClient() {
  return createBrowserClient(url, anon);
}
