/**
 * Finds the tenant's Accounts Payable account + lead status vocabulary.
 * Run: bun scripts/inspect-ap.ts
 */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEFAULT_TENANT_ID } from '../src/lib/supabaseConfig';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data: ap } = await supabase
  .from('acct_chart_of_accounts')
  .select('id, code, name, account_type, subtype')
  .eq('tenant_id', DEFAULT_TENANT_ID)
  .ilike('name', '%payable%');
console.log('payable accounts:', JSON.stringify(ap, null, 2));

const { data: allAccounts } = await supabase
  .from('acct_chart_of_accounts')
  .select('id, code, name, account_type, subtype, is_active')
  .eq('tenant_id', DEFAULT_TENANT_ID)
  .eq('is_active', true)
  .order('code');
console.log('\nall active COA accounts:', JSON.stringify(allAccounts, null, 2));

const { data: leads } = await supabase.from('crm_leads').select('status, lead_source, lead_type').limit(20);
console.log('\nlead statuses in use:', JSON.stringify(leads?.map(l => l.status)));
console.log('lead sources in use:', JSON.stringify(leads?.map(l => l.lead_source)));
console.log('lead types in use:', JSON.stringify(leads?.map(l => l.lead_type)));
