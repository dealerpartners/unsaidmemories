/**
 * Dumps the real column inventory of the CRM party tables via PostgREST's
 * OpenAPI root (GET /rest/v1/). Run: bun scripts/dump-crm-schema.ts
 */
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../src/lib/supabaseConfig';

const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  },
});
if (!res.ok) {
  console.log('FAILED:', res.status, await res.text());
  process.exit(1);
}
const spec: any = await res.json();

const tables = [
  'crm_customers',
  'acct_vendors',
  'suppliers',
  'crm_leads',
  'crm_notes',
  'crm_tasks',
  'crm_activity',
];

for (const t of tables) {
  const def = spec.definitions?.[t];
  if (!def) {
    console.log(`\n=== ${t} === NOT FOUND in schema`);
    continue;
  }
  const props: Record<string, any> = def.properties || {};
  const required: string[] = def.required || [];
  console.log(`\n=== ${t} (${Object.keys(props).length} columns) ===`);
  for (const [name, p] of Object.entries(props)) {
    console.log(
      `  ${name.padEnd(30)} ${String((p as any).format || (p as any).type).padEnd(14)} ${required.includes(name) ? 'REQUIRED' : 'optional'}${(p as any).default != null ? ` def:${(p as any).default}` : ''}`
    );
  }
}
