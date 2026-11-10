/**
 * Inspects seeded vendor rows + finds the AP account used, and lists tables.
 * Run: bun scripts/inspect-vendors.ts
 */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../src/lib/supabaseConfig';
import { DEFAULT_TENANT_ID } from '../src/lib/supabaseConfig';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const specRes = await fetch(`${SUPABASE_URL}/rest/v1/`, {
  headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
});
const spec: any = await specRes.json();
const tableNames = Object.keys(spec.definitions || {}).filter(t =>
  /account|coa|chart/i.test(t)
);
console.log('account-like tables:', tableNames.join(', '));

const { data: vendors } = await supabase
  .from('acct_vendors')
  .select('id, vendor_number, legal_name, currency, ap_account_id, payment_terms_days, is_1099_vendor, tax_number, tax_form_type, w9_received_at')
  .eq('tenant_id', DEFAULT_TENANT_ID)
  .limit(5);
console.log('\nseeded vendors:', JSON.stringify(vendors, null, 2));

if (vendors && vendors[0]?.ap_account_id) {
  for (const t of tableNames) {
    const { data } = await supabase.from(t).select('*').eq('id', vendors[0].ap_account_id).limit(1);
    if (data && data.length) {
      console.log(`\nAP account found in ${t}:`, JSON.stringify(data[0], null, 2));
    }
  }
}

// supplier rows for catalog_source/kind values
const { data: suppliers } = await supabase.from('suppliers').select('id, name, slug, kind, catalog_source, ordering_status').limit(5);
console.log('\nsuppliers:', JSON.stringify(suppliers, null, 2));

// lead status values in use
const { data: leads } = await supabase.from('crm_leads').select('status, lead_source, lead_type').limit(10);
console.log('\nleads:', JSON.stringify(leads, null, 2));
