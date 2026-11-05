'use client';

/* Admin → Settings → Video: per-tenant telemedicine video credentials.
 * The admin chooses Zoom or Google Meet and plugs in that provider's
 * own credential set. The API is write-only for credential values: it
 * returns only whether each field is configured and its last-4 mask. */

import { useEffect, useState } from 'react';

type FieldState = {
  configured: boolean;
  masked: string | null;
};

type PricingState = {
  consultFeeCents: number;
  consultFeeIsSet: boolean;
  consultFeeSource: 'tenant' | 'platform' | 'default';
  defaultConsultFeeCents: number;
};

type VideoSettings = {
  hasRow: boolean;
  provider: 'zoom' | 'google_meet' | null;
  enabled: boolean;
  configured: boolean;
  zoom: {
    accountId: FieldState;
    clientId: FieldState;
    clientSecret: FieldState;
    webhookSecretToken: FieldState;
    complete: boolean;
  };
  google: {
    clientId: FieldState;
    clientSecret: FieldState;
    refreshToken: FieldState;
    complete: boolean;
  };
  updatedAt: string | null;
};

function SecretField({
  label, hint, masked, value, onChange,
}: {
  label: string; hint?: string; masked: string | null;
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="mb-4">
      <label className="text-xs font-semibold uppercase tracking-wider">{label}</label>
      {masked && (
        <div className="text-xs text-muted-foreground mt-0.5">
          Current: <span className="font-mono">{masked}</span>
        </div>
      )}
      <input
        type="password" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="Leave blank to keep current value"
        autoComplete="off"
        className="w-full mt-1 border border-border rounded p-2 text-sm bg-background font-mono"
      />
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export default function VideoSettingsPage() {
  const [settings, setSettings] = useState<VideoSettings | null>(null);
  const [pricing, setPricing] = useState<PricingState | null>(null);
  const [feeInput, setFeeInput] = useState('');
  const [savingFee, setSavingFee] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [provider, setProvider] = useState<'zoom' | 'google_meet'>('zoom');
  const [enabled, setEnabled] = useState(false);
  const [zoomAccountId, setZoomAccountId] = useState('');
  const [zoomClientId, setZoomClientId] = useState('');
  const [zoomClientSecret, setZoomClientSecret] = useState('');
  const [zoomWebhookSecretToken, setZoomWebhookSecretToken] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [googleRefreshToken, setGoogleRefreshToken] = useState('');

  const applySettings = (next: VideoSettings) => {
    setSettings(next);
    if (next.provider) setProvider(next.provider);
    setEnabled(next.enabled);
  };

  const applyPricing = (next: PricingState | null | undefined) => {
    if (!next) return;
    setPricing(next);
    setFeeInput((next.consultFeeCents / 100).toFixed(2));
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/video');
      const j = await res.json();
      if (j?.ok) { applySettings(j.settings); applyPricing(j.pricing); }
      else setMsg(j?.error || 'Failed to load video settings.');
    } catch { setMsg('Failed to load video settings.'); }
    setLoading(false);
  };

  const savePricing = async (clear: boolean) => {
    setSavingFee(true); setMsg('');
    let consultFeeCents: number | null = null;
    if (!clear) {
      const dollars = Number(feeInput);
      if (!Number.isFinite(dollars) || dollars < 1 || dollars > 10000) {
        setMsg('Enter a consult fee between $1.00 and $10,000.00.');
        setSavingFee(false);
        return;
      }
      consultFeeCents = Math.round(dollars * 100);
    }
    try {
      const res = await fetch('/api/admin/settings/video', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, enabled, consultFeeCents }),
      });
      const j = await res.json();
      if (j?.ok) {
        applySettings(j.settings);
        applyPricing(j.pricing);
        setMsg(clear
          ? 'Consult fee cleared. New bookings use the default price until a fee is set.'
          : 'Consult fee saved. It applies to new bookings; consults already booked keep the fee on their record.');
      } else setMsg(j?.error || 'Could not save the consult fee.');
    } catch { setMsg('Could not save the consult fee.'); }
    setSavingFee(false);
  };

  useEffect(() => { load(); }, []);

  const clearCredentialInputs = () => {
    setZoomAccountId('');
    setZoomClientId('');
    setZoomClientSecret('');
    setZoomWebhookSecretToken('');
    setGoogleClientId('');
    setGoogleClientSecret('');
    setGoogleRefreshToken('');
  };

  const save = async () => {
    setSaving(true); setMsg('');
    const body: Record<string, unknown> = { provider, enabled };
    if (provider === 'zoom') {
      body.zoom = {
        accountId: zoomAccountId,
        clientId: zoomClientId,
        clientSecret: zoomClientSecret,
        webhookSecretToken: zoomWebhookSecretToken,
      };
    } else {
      body.google = {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        refreshToken: googleRefreshToken,
      };
    }
    try {
      const res = await fetch('/api/admin/settings/video', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j?.ok) {
        setMsg('Saved. Telemedicine sessions will use these settings when video is started.');
        clearCredentialInputs();
        applySettings(j.settings);
        applyPricing(j.pricing);
      } else setMsg(j?.error || 'Save failed.');
    } catch { setMsg('Save failed.'); }
    setSaving(false);
  };

  const clear = async () => {
    if (!window.confirm('Remove this tenant’s telemedicine video settings? Video visits will be unavailable until a provider is configured again.')) return;
    setClearing(true); setMsg('');
    try {
      const res = await fetch('/api/admin/settings/video', { method: 'DELETE' });
      const j = await res.json();
      if (j?.ok) {
        setMsg(j.cleared ? 'Video settings cleared.' : 'No video settings were stored for this tenant.');
        clearCredentialInputs();
        applySettings(j.settings);
      } else setMsg(j?.error || 'Clear failed.');
    } catch { setMsg('Clear failed.'); }
    setClearing(false);
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading video settings…</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Telemedicine Video Settings</h1>

      {msg && <p className="text-sm mb-4 p-2 border border-border rounded bg-muted">{msg}</p>}

      {settings && !settings.configured && (
        <div className="text-sm mb-4 p-3 border border-amber-500 rounded bg-amber-50 dark:bg-amber-950">
          Telemedicine video is not configured for this tenant yet. Choose a provider, enter its
          complete credential set, and turn video on. Until then, pet owners and vets will see
          that video calling is not set up for the practice.
        </div>
      )}

      {settings && (
        <div className="flex flex-wrap gap-2 mb-6 text-xs">
          <span className={`px-2 py-1 rounded ${settings.configured ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-muted text-muted-foreground'}`}>
            {settings.configured
              ? `${settings.provider === 'zoom' ? 'Zoom' : 'Google Meet'} · configured`
              : 'Video · not configured'}
          </span>
          {settings.updatedAt && (
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
              Last updated {new Date(settings.updatedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      <div className="border border-border rounded mb-6">
        <h2 className="text-sm font-semibold mb-3">Provider</h2>
        <div className="space-y-2 mb-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio" name="video-provider" value="zoom"
              checked={provider === 'zoom'} onChange={() => setProvider('zoom')}
            />
            Zoom — Server-to-Server OAuth
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio" name="video-provider" value="google_meet"
              checked={provider === 'google_meet'} onChange={() => setProvider('google_meet')}
            />
            Google Meet — OAuth client + refresh token
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm mb-5">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable video for telemedicine visits
        </label>

        {provider === 'zoom' ? (
          <>
            <SecretField
              label="Zoom account ID"
              hint="From the Zoom Server-to-Server OAuth app for this tenant’s Zoom account."
              masked={settings?.zoom.accountId.masked || null}
              value={zoomAccountId}
              onChange={setZoomAccountId}
            />
            <SecretField
              label="Zoom client ID"
              hint="The client ID from the same Server-to-Server OAuth app."
              masked={settings?.zoom.clientId.masked || null}
              value={zoomClientId}
              onChange={setZoomClientId}
            />
            <SecretField
              label="Zoom client secret"
              hint="Write-only. The saved value is never returned by this page."
              masked={settings?.zoom.clientSecret.masked || null}
              value={zoomClientSecret}
              onChange={setZoomClientSecret}
            />
            <SecretField
              label="Zoom event subscription secret token"
              hint="A separate credential from the OAuth set above — Zoom issues it on the app's Event Subscriptions page. Write-only. Google Meet has no equivalent subscription; this field is Zoom-only."
              masked={settings?.zoom.webhookSecretToken.masked || null}
              value={zoomWebhookSecretToken}
              onChange={setZoomWebhookSecretToken}
            />
            <div className="mb-4 border border-border rounded p-3 bg-muted">
              <label className="text-xs font-semibold uppercase tracking-wider">Event subscription endpoint</label>
              <p className="text-xs text-muted-foreground mt-1">
                In the same Zoom app, open Features → Event Subscriptions, add a subscription for
                meeting.started, meeting.ended, and recording.completed, and paste this URL as
                the event notification endpoint:
              </p>
              <p className="font-mono text-sm mt-2 select-all break-all">https://unsaidmemories.com/api/telemed/video/events</p>
              <p className="text-xs text-muted-foreground mt-2">
                Zoom validates the URL when you save it. The Secret Token Zoom shows on that same
                Event Subscriptions page goes into the secret token field above — that token is
                what signs every event Zoom sends, and it is how this platform knows the events
                are really Zoom's.
              </p>
            </div>
          </>
        ) : (
          <>
            <SecretField
              label="Google client ID"
              hint="From the Google Cloud OAuth client used for Meet."
              masked={settings?.google.clientId.masked || null}
              value={googleClientId}
              onChange={setGoogleClientId}
            />
            <SecretField
              label="Google client secret"
              hint="From the same Google Cloud OAuth client."
              masked={settings?.google.clientSecret.masked || null}
              value={googleClientSecret}
              onChange={setGoogleClientSecret}
            />
            <SecretField
              label="Google refresh token"
              hint="Minted through the admin’s own Google OAuth consent for the Workspace account that will host Meet spaces. Write-only once saved."
              masked={settings?.google.refreshToken.masked || null}
              value={googleRefreshToken}
              onChange={setGoogleRefreshToken}
            />
          </>
        )}
      </div>

      <div className="border border-border rounded mb-6">
        <h2 className="text-sm font-semibold mb-1">Consult pricing</h2>
        <p className="text-xs text-muted-foreground mb-4">
          The fee a pet owner is quoted for a telemedicine consult. You set the price; it is
          stamped onto each new booking&rsquo;s record, and consults already booked keep the
          fee they were booked at. Until a fee is set, the default of{' '}
          {pricing ? `$${(pricing.defaultConsultFeeCents / 100).toFixed(2)}` : '$75.00'} applies.
        </p>
        {pricing && (
          <p className="text-sm mb-4">
            Fee in force for new bookings:{' '}
            <span className="font-semibold">${(pricing.consultFeeCents / 100).toFixed(2)}</span>
            <span className="text-muted-foreground">
              {pricing.consultFeeIsSet
                ? pricing.consultFeeSource === 'tenant'
                  ? ' · set for this practice'
                  : ' · set platform-wide'
                : ' · default (not yet set)'}
            </span>
          </p>
        )}
        <label className="text-xs font-semibold uppercase tracking-wider">Consult fee (USD)</label>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <div className="flex items-center">
            <span className="text-sm text-muted-foreground mr-1">$</span>
            <input
              type="number" min="1" max="10000" step="0.01" inputMode="decimal"
              value={feeInput} onChange={(e) => setFeeInput(e.target.value)}
              className="w-36 border border-border rounded p-2 text-sm bg-background"
            />
          </div>
          <button
            onClick={() => savePricing(false)} disabled={savingFee}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {savingFee ? 'Saving…' : 'Save consult fee'}
          </button>
          {pricing?.consultFeeIsSet && pricing.consultFeeSource === 'tenant' && (
            <button
              onClick={() => savePricing(true)} disabled={savingFee}
              className="px-4 py-2 rounded border border-border text-sm font-medium disabled:opacity-50"
            >
              Use default price
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={save} disabled={saving}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save video settings'}
        </button>
        <button
          onClick={clear} disabled={clearing || !settings?.hasRow}
          className="px-4 py-2 rounded border border-border text-sm font-medium disabled:opacity-50"
        >
          {clearing ? 'Clearing…' : 'Clear video settings'}
        </button>
      </div>
    </div>
  );
}
