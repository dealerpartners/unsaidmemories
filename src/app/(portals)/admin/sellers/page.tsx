'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Banknote, ClipboardList, FileText, Inbox, Percent, Search, ShieldCheck, Store, Wallet } from 'lucide-react';
import { PageHead } from '@/components/admin/ui';
import { SellerStatusBadge } from './seller-status-badge';

type Seller = {
  id: string;
  seller_type: string | null;
  legal_name: string | null;
  display_name: string;
  slug: string | null;
  email: string | null;
  commission_rate: number | null;
  status: string;
  created_at: string;
};

type Application = {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  partner_type: string;
  status: string;
  notes: string | null;
  created_at: string;
  filed_type: string | null;
};

type Counts = { all: number; applied: number; approved: number; suspended: number; closed: number; applications: number; reactivations: number };

const STATUSES = ['all', 'applied', 'approved', 'suspended', 'closed'] as const;

const TYPE_OPTIONS = [
  { value: 'manufacturer_brand', label: 'Manufacturer brand' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'reseller', label: 'Reseller' },
  { value: 'drop_shipper', label: 'Drop shipper' },
];

const STATUS_BADGE: Record<string, string> = {
  approved: 'adm-badge-green',
  applied: 'adm-badge-amber',
  new: 'adm-badge-amber',
  submitted: 'adm-badge-amber',
  suspended: 'adm-badge-red',
  closed: '',
  rejected: '',
};

// SellerStatusBadge moved to ./seller-status-badge (Next.js 16.3.3 type validator fix)

const AVATAR_BG = ['#dbeafe', '#e0f2f2', '#ede9fe', '#fdf0e0', '#e6f4ea', '#fde8e8'];
const AVATAR_FG = ['#2563eb', '#00595a', '#5b48c9', '#b45309', '#15803d', '#b91c1c'];
function avatarTint(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const i = h % AVATAR_BG.length;
  return { bg: AVATAR_BG[i], fg: AVATAR_FG[i] };
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function SellersPage() {
  const router = useRouter();
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [counts, setCounts] = useState<Counts>({ all: 0, applied: 0, approved: 0, suspended: 0, closed: 0, applications: 0, reactivations: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [stype, setStype] = useState<string>('all');
  const [types, setTypes] = useState<string[]>([]);
  const [appTypes, setAppTypes] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (status === 'reactivations') params.set('view', 'reactivations');
    else if (status !== 'all') params.set('status', status);
    if (stype !== 'all') params.set('type', stype);
    return fetch(`/api/admin/sellers?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        setSellers(Array.isArray(d.rows) ? d.rows : []);
        setApplications(Array.isArray(d.applications) ? d.applications : []);
        if (d.counts) setCounts(d.counts);
        if (Array.isArray(d.types)) setTypes(d.types);
      })
      .catch(() => { setSellers([]); setApplications([]); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    load().then(() => { if (cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, stype]);

  const onSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const decide = async (applicationId: string, action: 'approve_application' | 'reject_application') => {
    setActing(true);
    setError(null);
    try {
      const body: Record<string, string> = { action, application_id: applicationId };
      if (action === 'approve_application') {
        const t = appTypes[applicationId];
        if (t) body.seller_type = t;
      } else {
        if (reason.trim()) body.reason = reason.trim();
      }
      const r = await fetch('/api/admin/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Action failed');
      setRejecting(null);
      setReason('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div>
      <PageHead title="Seller Management" >
        <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => router.push('/admin/sellers/feed')}>Seller Feed</button>
      </PageHead>

      {/* Quick links to the seller workflows */}
      <div className="adm-card" style={{ marginBottom: 16, padding: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 13 }}>
          <Link href="/admin/sellers/review-queue" className="adm-link-row"><Inbox size={14} /> Review Queue</Link>
          <Link href="/admin/sellers/reinstatements" className="adm-link-row"><ShieldCheck size={14} /> Reinstatements</Link>
          <Link href="/admin/sellers/verification" className="adm-link-row"><ShieldCheck size={14} /> Verification desk</Link>
          <Link href="/admin/sellers/payments" className="adm-link-row"><Wallet size={14} /> Seller Payments</Link>
          <Link href="/admin/payouts" className="adm-link-row"><Banknote size={14} /> Payout Management</Link>
          <Link href="/admin/fees" className="adm-link-row"><Percent size={14} /> Fee schedules</Link>
          <Link href="/admin/sellers/tax" className="adm-link-row"><FileText size={14} /> Tax Oversight</Link>
          <Link href="/admin/sellers/remediation" className="adm-link-row"><ClipboardList size={14} /> Remediation plans</Link>
        </div>
      </div>

      {/* Application Queue */}
      <div className="adm-card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Inbox size={16} style={{ color: 'var(--muted-foreground)' }} />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Application Queue</h2>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{counts.applications} awaiting a decision</span>
        </div>
        {error && <div className="adm-alert adm-alert-error" style={{ margin: 12 }}>{error}</div>}
        {loading ? (
          <div style={{ padding: '16px', color: 'var(--muted-foreground)', fontSize: 13 }}>Loading…</div>
        ) : applications.length === 0 ? (
          <p style={{ padding: 16, fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
            No applications are waiting. New seller applications filed on the site or at onboarding Step 4 appear here.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {applications.map(a => {
              const chosen = appTypes[a.id] ?? a.filed_type ?? '';
              return (
                <div key={a.id} style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{a.business_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                        {a.contact_name} · {a.email}{a.phone ? ` · ${a.phone}` : ''} · filed{' '}
                        {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
                      </div>
                    </div>
                    <SellerStatusBadge status={a.status} />
                  </div>
                  {a.notes && (
                    <p style={{ fontSize: 12, color: 'var(--muted-foreground)', whiteSpace: 'pre-line', background: 'var(--muted)', borderRadius: 8, padding: '8px 10px', margin: '8px 0' }}>
                      {a.notes}
                    </p>
                  )}
                  {rejecting === a.id ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
                      <input
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Reason for rejection (recorded on the application)"
                        className="adm-input"
                        style={{ flex: 1, minWidth: 240 }}
                      />
                      <button disabled={acting} onClick={() => decide(a.id, 'reject_application')} className="adm-btn adm-btn-danger adm-btn-sm">
                        Confirm rejection
                      </button>
                      <button disabled={acting} onClick={() => { setRejecting(null); setReason(''); }} className="adm-btn adm-btn-ghost adm-btn-sm">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
                      <select
                        value={chosen}
                        disabled={acting}
                        onChange={e => setAppTypes(t => ({ ...t, [a.id]: e.target.value }))}
                        className="adm-select"
                        style={{ width: 'auto', maxWidth: 200 }}
                        title="Seller type to approve under"
                      >
                        <option value="">Seller type…</option>
                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button disabled={acting || !chosen} onClick={() => decide(a.id, 'approve_application')} className="adm-btn adm-btn-sm">
                        Approve
                      </button>
                      <button disabled={acting} onClick={() => setRejecting(a.id)} className="adm-btn adm-btn-ghost adm-btn-sm">
                        Reject
                      </button>
                      {a.filed_type && (
                        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                          Filed as {a.filed_type.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter toolbar */}
      <form onSubmit={onSearch} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sellers by name, email, slug…"
          className="adm-input"
          style={{ maxWidth: 320 }}
        />
        <select value={stype} onChange={e => setStype(e.target.value)} className="adm-select" style={{ width: 'auto' }} title="Filter by partner type">
          <option value="all">All types</option>
          {types.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </form>

      {/* Status tabs */}
      <div className="adm-tabs" style={{ marginBottom: 14 }}>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`adm-tab${status === s ? ' active' : ''}`}
            style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
          >
            <span style={{ textTransform: 'capitalize' }}>{s}</span>{s !== 'all' && counts[s as keyof Counts] > 0 ? ` (${counts[s as keyof Counts]})` : ''}
          </button>
        ))}
        <button
          onClick={() => setStatus('reactivations')}
          className={`adm-tab${status === 'reactivations' ? ' active' : ''}`}
          style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
          title="Suspended or closed sellers who were previously approved — the reactivation population"
        >
          Reactivations{counts.reactivations > 0 ? ` (${counts.reactivations})` : ''}
        </button>
      </div>

      {/* Seller directory */}
      {loading ? (
        <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Loading…</div>
      ) : sellers.length === 0 ? (
        <div className="adm-empty">
          <Store size={36} style={{ margin: '0 auto 6px', color: 'var(--muted-foreground)', opacity: 0.4 }} />
          <strong>No sellers found</strong>
          <div style={{ marginTop: 4 }}>
            {search || status !== 'all' ? 'Try a different search or status filter.' : 'Approved seller applications land here as seller accounts.'}
          </div>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Seller</th>
                <th>Type</th>
                <th>Email</th>
                <th style={{ textAlign: 'right' }}>Commission</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map(s => {
                const tint = avatarTint(s.display_name || s.email || '?');
                return (
                  <tr key={s.id} onClick={() => router.push(`/admin/sellers/${s.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 32, height: 32, borderRadius: '50%', flex: '0 0 32px',
                            display: 'grid', placeItems: 'center',
                            background: tint.bg, color: tint.fg,
                            font: '600 12px var(--font-display, "DM Sans")',
                          }}
                        >
                          {initials(s.display_name || s.email || '?')}
                        </span>
                        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}>
                          <span style={{ fontWeight: 600 }}>{s.display_name}</span>
                          {s.legal_name && s.legal_name !== s.display_name && (
                            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{s.legal_name}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td style={{ color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>{s.seller_type?.replace(/_/g, ' ') || '—'}</td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{s.email || '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted-foreground)' }}>
                      {s.commission_rate != null ? `${Number(s.commission_rate).toFixed(2)}%` : '—'}
                    </td>
                    <td><SellerStatusBadge status={s.status} /></td>
                    <td style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
