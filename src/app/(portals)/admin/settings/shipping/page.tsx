'use client';

/* Admin → Settings → Shipping: carrier API credentials.
 * Secrets are stored in the app_settings table (shipping.* keys) and are never
 * returned in full by the API — only configured flags + last-4 masks. */

import { useEffect, useState } from 'react';

type Config = {
  defaultProvider: 'shippo' | 'usps';
  shippo: { configured: boolean; testMode: boolean; masked: string | null };
  usps: {
    configured: boolean; canBuyReal: boolean;
    consumerKeyMasked: string | null; cridMasked: string | null;
    mailerIdMasked: string | null; epsAccountMasked: string | null;
  };
};

function SecretField({
  label, hint, masked, value, onChange, placeholder,
}: {
  label: string; hint?: string; masked: string | null;
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="mb-4">
      <label className="text-xs font-semibold uppercase tracking-wider">{label}</label>
      {masked && <div className="text-xs text-muted-foreground mt-0.5">Current: <span className="font-mono">{masked}</span></div>}
      <input
        type="password" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Leave blank to keep current value'}
        autoComplete="off"
        className="w-full mt-1 border border-border rounded p-2 text-sm bg-background font-mono"
      />
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function TextField({
  label, hint, value, onChange, placeholder,
}: {
  label: string; hint?: string;
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="mb-4">
      <label className="text-xs font-semibold uppercase tracking-wider">{label}</label>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoComplete="off"
        className="w-full mt-1 border border-border rounded p-2 text-sm bg-background"
      />
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

type ReturnAddress = { name: string; street: string; city: string; state: string; zip: string; phone: string };
const EMPTY_ADDR: ReturnAddress = { name: '', street: '', city: '', state: '', zip: '', phone: '' };

/* Label return address for THIS tenant (ship_from_addresses). Every tenant
 * sets its own; sellers set theirs in the Seller Portal. Labels for this
 * tenant's orders print this address — there is no platform default. */
function ReturnAddressSection() {
  const [addr, setAddr] = useState<ReturnAddress>(EMPTY_ADDR);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings/shipping/return-address')
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j.address) {
          setAddr({
            name: j.address.name || '', street: j.address.street || '', city: j.address.city || '',
            state: j.address.state || '', zip: j.address.zip || '', phone: j.address.phone || '',
          });
        }
      })
      .catch(() => setMsg('Failed to load the return address.'))
      .finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/admin/settings/shipping/return-address', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addr),
      });
      const j = await res.json();
      setMsg(j?.ok ? 'Return address saved.' : (j?.error || 'Save failed.'));
    } catch { setMsg('Save failed.'); }
    setSaving(false);
  };

  const set = (k: keyof ReturnAddress) => (v: string) => setAddr((a) => ({ ...a, [k]: v }));

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">Label return address</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Printed as the sender on shipping labels for this shop's own orders. Each tenant
        sets its own address — and marketplace sellers set theirs separately in the Seller
        Portal, so a seller's orders never ship under this shop's name. Labels can't be
        bought until a complete address with a ZIP is saved.
      </p>
      {msg && <p className="text-sm mb-4 p-2 border border-border rounded bg-muted">{msg}</p>}
      {loaded && !addr.zip && (
        <p className="text-sm mb-4 p-2 border border-amber-300 rounded bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No ZIP saved yet — USPS and Shippo will refuse labels for this shop's orders until one is added.
        </p>
      )}
      <TextField label="Name / business" value={addr.name} onChange={set('name')} placeholder="UnSaid Memories" />
      <TextField label="Street" value={addr.street} onChange={set('street')} placeholder="699 Waring Rd" />
      <div className="grid grid-cols-2 gap-4">
        <TextField label="City" value={addr.city} onChange={set('city')} placeholder="Memphis" />
        <TextField label="State" value={addr.state} onChange={set('state')} placeholder="TN" />
        <TextField label="ZIP" value={addr.zip} onChange={set('zip')} placeholder="Required for labels" />
        <TextField label="Phone" value={addr.phone} onChange={set('phone')} placeholder="(901) 722-1114" />
      </div>
      <button
        onClick={save} disabled={saving || !loaded}
        className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save return address'}
      </button>
    </section>
  );
}

export default function ShippingSettingsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const [defaultProvider, setDefaultProvider] = useState<'shippo' | 'usps'>('shippo');
  const [shippoTestMode, setShippoTestMode] = useState(false);
  const [shippoKey, setShippoKey] = useState('');
  const [uspsKey, setUspsKey] = useState('');
  const [uspsSecret, setUspsSecret] = useState('');
  const [uspsCrid, setUspsCrid] = useState('');
  const [uspsMailerId, setUspsMailerId] = useState('');
  const [uspsEps, setUspsEps] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/shipping');
      const j = await res.json();
      if (j?.ok) {
        setConfig(j);
        setDefaultProvider(j.defaultProvider);
        setShippoTestMode(!!j.shippo.testMode);
      } else setMsg(j?.error || 'Failed to load shipping settings.');
    } catch { setMsg('Failed to load shipping settings.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true); setMsg('');
    // Only send secret fields the admin actually typed — blank keeps the stored value.
    const body: Record<string, string> = {
      'shipping.label_provider': defaultProvider,
      'shipping.shippo_test_mode': shippoTestMode ? 'true' : 'false',
    };
    if (shippoKey.trim()) body['shipping.shippo_api_key'] = shippoKey.trim();
    if (uspsKey.trim()) body['shipping.usps_consumer_key'] = uspsKey.trim();
    if (uspsSecret.trim()) body['shipping.usps_consumer_secret'] = uspsSecret.trim();
    if (uspsCrid.trim()) body['shipping.usps_crid'] = uspsCrid.trim();
    if (uspsMailerId.trim()) body['shipping.usps_mailer_id'] = uspsMailerId.trim();
    if (uspsEps.trim()) body['shipping.usps_eps_account'] = uspsEps.trim();
    try {
      const res = await fetch('/api/admin/settings/shipping', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j?.ok) {
        setMsg(`Saved: ${j.saved.join(', ')}`);
        setShippoKey(''); setUspsKey(''); setUspsSecret(''); setUspsCrid(''); setUspsMailerId(''); setUspsEps('');
        load();
      } else setMsg(j?.error || 'Save failed.');
    } catch { setMsg('Save failed.'); }
    setSaving(false);
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading shipping settings…</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Shipping Settings</h1>

      {msg && <p className="text-sm mb-4 p-2 border border-border rounded bg-muted">{msg}</p>}

      {config && (
        <div className="flex gap-2 mb-6 text-xs">
          <span className={`px-2 py-1 rounded ${config.shippo.configured ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-muted text-muted-foreground'}`}>
            Shippo {config.shippo.configured ? (config.shippo.testMode ? '· test mode' : '· live') : '· not configured'}
          </span>
          <span className={`px-2 py-1 rounded ${config.usps.canBuyReal ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : config.usps.configured ? 'adm-badge adm-badge-amber dark:bg-amber-900 dark:text-amber-200' : 'bg-muted text-muted-foreground'}`}>
            USPS direct {config.usps.canBuyReal ? '· real labels' : config.usps.configured ? '· labels unavailable (no EPS account)' : '· not configured'}
          </span>
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Default label provider</h2>
        <div className="grid grid-cols-2 gap-2 max-w-md">
          {(['shippo', 'usps'] as const).map((p) => (
            <button
              key={p} onClick={() => setDefaultProvider(p)}
              className={`px-3 py-2 text-sm font-medium rounded border ${ defaultProvider === p ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted' }`}
            >
              {p === 'shippo' ? 'Shippo' : 'USPS (direct)'}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Used when the label modal opens. Staff can override per label with the carrier toggle.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Shippo</h2>
        <SecretField label="Shippo API key" masked={config?.shippo.masked || null}
          value={shippoKey} onChange={setShippoKey}
          hint="Live key (shippo_live_…) or test key (shippo_test_… — automatically detected as test mode)." />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={shippoTestMode} onChange={(e) => setShippoTestMode(e.target.checked)} />
          Force test mode (labels will not be real postage)
        </label>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">USPS (direct API)</h2>
        <SecretField label="Consumer key" masked={config?.usps.consumerKeyMasked || null}
          value={uspsKey} onChange={setUspsKey} />
        <SecretField label="Consumer secret" masked={null}
          value={uspsSecret} onChange={setUspsSecret}
          hint="Never displayed, even masked. Leave blank to keep the stored secret." />
        <SecretField label="Customer registration ID (CRID)" masked={config?.usps.cridMasked || null}
          value={uspsCrid} onChange={setUspsCrid} />
        <SecretField label="Mailer ID (MID)" masked={config?.usps.mailerIdMasked || null}
          value={uspsMailerId} onChange={setUspsMailerId} />
        <SecretField label="EPS payment account number" masked={config?.usps.epsAccountMasked || null}
          value={uspsEps} onChange={setUspsEps}
          hint="Required for REAL labels. Without it, USPS label purchases fail honestly — no label is created." />
      </section>

      <ReturnAddressSection />

      <button
        onClick={save} disabled={saving}
        className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save shipping settings'}
      </button>
    </div>
  );
}
