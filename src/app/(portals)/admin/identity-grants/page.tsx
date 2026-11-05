'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, Info } from 'lucide-react';

// ============================================================================
// /admin/identity-grants — X1 · the identity-grant console.
//
// ONE identity, many portals: a row in public.identity_grants is what lets
// one person hold several portals (the grants-first resolver reads these
// rows; the account-menu switcher offers exactly the active ones). This
// console is the deliberate human door onto that table: grant a portal to
// an existing identity, revoke one, restore one. The table has no
// granted_by column — provenance is the row's `source` ('admin_console'
// for grants issued here) plus created_at, shown in the list.
//
// Revocation is a status flip, never a delete: the resolver honors only
// status 'active'. It takes effect at the identity's next session
// resolution — an already-signed session carries its grant set in the
// cookie until it refreshes, which the notice below states plainly.
// ============================================================================

type Grant = {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  scope: string;
  role: string | null;
  membershipRole: string | null;
  tenantId: string | null;
  stationName: string | null;
  status: string;
  source: string | null;
  createdAt: string;
};

const SCOPES = ['admin', 'employee', 'customer', 'seller', 'vet', 'pharmacy'] as const;
const ROLE_DEFAULT: Record<string, string> = {
  admin: 'admin',
  employee: 'groomer',
  customer: 'customer',
  seller: 'seller',
  vet: 'vet',
  pharmacy: 'pharmacy',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const shortId = (id: string | null) => (id ? `${id.slice(0, 8)}…` : '—');

export default function IdentityGrantsPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Grant form
  const [email, setEmail] = useState('');
  const [scope, setScope] = useState<string>('customer');
  const [role, setRole] = useState(ROLE_DEFAULT.customer);
  const [membershipRole, setMembershipRole] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/identity-grants');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Load failed');
      setGrants(d.grants || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return grants;
    return grants.filter((g) =>
      [g.email, g.displayName, g.scope, g.role, g.membershipRole, g.source, g.userId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [grants, filter]);

  const pickScope = (s: string) => {
    setScope(s);
    setRole(ROLE_DEFAULT[s] || '');
  };

  const grant = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const r = await fetch('/api/admin/identity-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          scope,
          role: role.trim() || undefined,
          membershipRole: membershipRole.trim() || undefined,
          tenantId: tenantId.trim() || undefined,
          displayName: displayName.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Grant failed');
      setNotice(
        d.alreadyHeld
          ? `${email.trim()} already holds the ${scope} portal — the existing grant stands, nothing was duplicated.`
          : `${scope} portal granted to ${email.trim()}. It appears in their account menu switcher at their next session resolution.`,
      );
      setEmail('');
      setMembershipRole('');
      setTenantId('');
      setDisplayName('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (g: Grant, status: 'active' | 'revoked') => {
    setError(null);
    setNotice(null);
    setRowBusy(g.id);
    try {
      const r = await fetch('/api/admin/identity-grants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: g.id, status }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Update failed');
      setNotice(
        status === 'revoked'
          ? `${g.scope} grant for ${g.email || g.displayName || g.userId} revoked. It stops adjoining at their next session resolution; a session already signed keeps its signed grant set until it refreshes.`
          : `${g.scope} grant for ${g.email || g.displayName || g.userId} restored to active.`,
      );
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRowBusy(null);
    }
  };

  const inputCls = 'w-full border rounded px-2 py-1.5 text-sm';

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <KeyRound className="w-5 h-5" /> Identity Grants
        </h1>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-sm border rounded px-2.5 py-1.5 hover:bg-muted"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      <div className="flex items-start gap-2 text-sm border rounded p-3 mb-5 bg-muted/40">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          A grant adjoins a portal to an <strong>existing</strong> identity — the person signs up first,
          then the portal is granted here. Grants and revocations take effect at the identity&apos;s next
          session resolution: a session that is already signed in carries its grant set in its cookie
          until it refreshes. Revocation is a status flip, never a delete — the row stays as the record.
        </span>
      </div>

      {error && (
        <div className="border border-red-300 adm-badge adm-badge-red rounded p-3 mb-4 text-sm">{error}</div>
      )}
      {notice && <div className="border rounded p-3 mb-4 text-sm bg-muted/40">{notice}</div>}

      <div className="border rounded mb-6">
        <h2 className="font-semibold mb-3">Grant a portal</h2>
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {SCOPES.map((s) => (
            <button
              key={s}
              onClick={() => pickScope(s)}
              className={`px-3 py-1.5 rounded border text-sm capitalize ${ scope === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted' }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Account email (required)</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Role</span>
            <input value={role} onChange={(e) => setRole(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Membership role (optional)</span>
            <input
              value={membershipRole}
              onChange={(e) => setMembershipRole(e.target.value)}
              placeholder={scope === 'admin' ? 'platform_admin' : scope === 'employee' ? 'groomer' : '—'}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Display name (optional)</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs uppercase text-muted-foreground">
              Tenant id (optional — empty = platform-wide grant)
            </span>
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="uuid"
              className={inputCls}
            />
          </label>
        </div>
        <button
          onClick={grant}
          disabled={busy || !email.trim()}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
        >
          {busy ? 'Granting…' : `Grant ${scope} portal`}
        </button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">
          Recorded grants{' '}
          <span className="text-muted-foreground font-normal text-sm">
            ({visible.length} of {grants.length})
          </span>
        </h2>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by email, name, portal, source…"
          className="border rounded px-2 py-1.5 text-sm w-64"
        />
      </div>

      <div className="border rounded divide-y">
        {loading ? (
          <p className="p-3 text-sm text-muted-foreground">Loading grants…</p>
        ) : visible.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {grants.length === 0
              ? 'No identity grants are recorded yet.'
              : 'No grants match that filter.'}
          </p>
        ) : (
          visible.map((g) => (
            <div key={g.id} className="p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="min-w-52">
                <span className="font-medium block">{g.displayName || g.email || shortId(g.userId)}</span>
                <span className="text-xs text-muted-foreground block">
                  {g.email ? `${g.email} · ` : ''}user {shortId(g.userId)}
                </span>
              </span>
              <span className="capitalize font-medium">{g.scope}</span>
              <span className="text-muted-foreground">
                {g.role || '—'}
                {g.membershipRole ? ` · ${g.membershipRole}` : ''}
              </span>
              <span className="text-xs text-muted-foreground">tenant {shortId(g.tenantId)}</span>
              <span className="text-xs text-muted-foreground">via {g.source || '—'}</span>
              <span className="text-xs text-muted-foreground">{when(g.createdAt)}</span>
              <span
                className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ g.status === 'active' ? 'adm-badge adm-badge-green' : 'adm-badge adm-badge-red' }`}
              >
                {g.status}
              </span>
              {g.status === 'active' ? (
                <button
                  onClick={() => setStatus(g, 'revoked')}
                  disabled={rowBusy === g.id}
                  className="text-sm border rounded px-2.5 py-1 hover:bg-muted disabled:opacity-50"
                >
                  {rowBusy === g.id ? 'Working…' : 'Revoke'}
                </button>
              ) : (
                <button
                  onClick={() => setStatus(g, 'active')}
                  disabled={rowBusy === g.id}
                  className="text-sm border rounded px-2.5 py-1 hover:bg-muted disabled:opacity-50"
                >
                  {rowBusy === g.id ? 'Working…' : 'Restore'}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
