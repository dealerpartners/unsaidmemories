import { createClient } from '@supabase/supabase-js';
// Server-only Supabase client. Prefers the service-role key (bypasses RLS for
// order writes); falls back to the anon key. Returns null when unconfigured —
// callers must degrade gracefully, never crash the build.
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !key) return null;
  return createClient(url, key);
}

// Platform tenant id (slug 'unsaid-memories'), cached per process.
let tenantCache: string | null | undefined;
export async function getPlatformTenantId(client: NonNullable<ReturnType<typeof getServiceClient>>): Promise<string | null> {
  if (tenantCache !== undefined) return tenantCache;
  const res: any = await client.from('tenants').select('id').eq('slug', 'unsaid-memories').limit(1).maybeSingle();
  tenantCache = res?.data?.id ?? null;
  return tenantCache ?? null;
}
