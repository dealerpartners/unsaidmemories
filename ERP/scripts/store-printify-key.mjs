/**
 * Store the new Printify bearer token in integration_keys (AES-256-GCM),
 * the same scheme supplierKeys.getIntegrationKey reads.
 */
import { createCipheriv, createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pcwwvfgxnrglmmpbfqhf.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd3d2Zmd4bnJnbG1tcGJmcWhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzIzMTEwOCwiZXhwIjoyMTA4ODA3MTA4fQ.VxltFn42SYE66BBTiYPzZI_5GQ7aMYJyIxoYHqCNgNA';
const TENANT_ID = '652fd2be-d19a-4778-835d-db38094d7718';
const NEW_TOKEN = process.argv[2];
if (!NEW_TOKEN) { console.error('usage: node store-printify-key.mjs <token>'); process.exit(1); }

const material = createHash('sha256').update(SERVICE_KEY).digest();
const iv = createHash('sha256').update('iv:' + Date.now() + ':' + Math.random()).digest().subarray(0, 12);
const cipher = createCipheriv('aes-256-gcm', material, iv);
const enc = Buffer.concat([cipher.update(NEW_TOKEN, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
const payload = Buffer.concat([iv, tag, enc]).toString('base64');

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await sb
  .from('integration_keys')
  .upsert({
    tenant_id: TENANT_ID,
    key_name: 'PRINTIFY_API_KEY',
    encrypted_value: payload,
  }, { onConflict: 'tenant_id,key_name' })
  .select('id,key_name');
if (error) { console.error('DB error:', error.message); process.exit(1); }
console.log('Stored PRINTIFY_API_KEY:', JSON.stringify(data));

// Verify it round-trips (decrypt check)
const { createDecipheriv } = await import('crypto');
const buf = Buffer.from(payload, 'base64');
const iv2 = buf.subarray(0, 12);
const tag2 = buf.subarray(12, 28);
const enc2 = buf.subarray(28);
const decipher = createDecipheriv('aes-256-gcm', material, iv2);
decipher.setAuthTag(tag2);
const out = Buffer.concat([decipher.update(enc2), decipher.final()]).toString('utf8');
console.log('Round-trip OK:', out === NEW_TOKEN);
