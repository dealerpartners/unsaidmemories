'use client';

// Partner Quick Actions (§2.4.7) — ONE modal for partner decisions
// across the four partner types, mounted on the Inventory surface (the
// §2.4 directive's home). Each type rides its OWN real queue and its
// OWN real decision endpoint — this modal is a shared face, not a
// shared store:
//   Groomers  GET  /api/admin/partners/grooming
//             POST /api/admin/partners/grooming/[id]
//                  { action: begin_review | activate | reject(reason) }
//   Vets      GET  /api/admin/telemed/credentialing (vetApplications)
//             POST /api/admin/telemed/credentialing/vet/[id]
//                  { action: begin_review | approve_application | reject_application }
//   Pharmacy  GET  /api/admin/telemed/credentialing (pharmacyApplications)
//             POST /api/admin/telemed/credentialing/pharmacy/[id]
//                  { action: begin_review | approve_application | reject_application(reason) }
//   Sellers   GET  /api/admin/sellers/feed (pending product feed items)
//             PATCH /api/admin/sellers/feed { id, status: approved | rejected | suspended }
import React, { useCallback, useEffect, useState } from 'react';
import { X, Scissors, Stethoscope, Pill, Store, Loader2 } from 'lucide-react';

type PartnerType = 'groomers' | 'vets' | 'pharmacy' | 'sellers';

type Row = {
  id: string;
  name: string;
  sub: string;
  status: string;
};

const TABS: { id: PartnerType; label: string; icon: React.ElementType }[] = [
  { id: 'groomers', label: '3rd-Party Groomers', icon: Scissors },
  { id: 'vets', label: 'Vets', icon: Stethoscope },
  { id: 'pharmacy', label: 'Pharmacy', icon: Pill },
  { id: 'sellers', label: 'Sellers', icon: Store },
];

const DECIDED = ['approved', 'rejected', 'active', 'suspended', 'completed'];

export const PartnerQuickActions: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [type, setType] = useState<PartnerType>('groomers');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg('');
    try {
      if (type === 'groomers') {
        const j = await fetch('/api/admin/partners/grooming').then((r) => r.json());
        setRows((j.applications || []).map((a: any) => ({
          id: a.id,
          name: a.business_name || a.contact_name || a.email,
          sub: [a.contact_name, a.email, [a.city, a.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
          status: a.status,
        })));
      } else if (type === 'vets' || type === 'pharmacy') {
        const j = await fetch('/api/admin/telemed/credentialing').then((r) => r.json());
        const list = (type === 'vets' ? j.vetApplications : j.pharmacyApplications) || [];
        setRows(list.map((entry: any) => {
          const a = entry.application || entry;
          return {
            id: a.id,
            name: a.practice_name || a.pharmacy_name || a.contact_name || a.pharmacist_name || a.email,
            sub: [a.contact_name || a.pharmacist_name, a.email, [a.city, a.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
            status: a.status,
          };
        }));
      } else {
        const j = await fetch('/api/admin/sellers/feed?status=pending').then((r) => r.json());
        setRows((j.rows || []).map((f: any) => ({
          id: f.id,
          name: f.product_name || f.sku || 'Feed item',
          sub: [f.seller_name, f.sku].filter(Boolean).join(' · '),
          status: f.status,
        })));
      }
    } catch {
      setRows([]);
      setMsg('The queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const act = async (row: Row, action: string) => {
    setBusyId(row.id);
    setMsg('');
    try {
      let res: Response;
      if (type === 'groomers') {
        const body: Record<string, unknown> = { action };
        if (action === 'reject') {
          const reason = window.prompt('Rejection reason — recorded on the application:');
          if (!reason) { setBusyId(null); return; }
          body.reason = reason;
        }
        res = await fetch(`/api/admin/partners/grooming/${row.id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      } else if (type === 'vets' || type === 'pharmacy') {
        const body: Record<string, unknown> = { action };
        if (action === 'reject_application') {
          const reason = window.prompt('Rejection reason — recorded on the application:');
          if (type === 'pharmacy' && !reason) { setBusyId(null); setMsg('A reason is required to reject a pharmacy application.'); return; }
          if (reason) body.reason = reason;
        }
        res = await fetch(`/api/admin/telemed/credentialing/${type === 'vets' ? 'vet' : 'pharmacy'}/${row.id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/admin/sellers/feed', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id, status: action }),
        });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || 'The decision could not be saved.'); return; }
      setMsg(`${row.name}: decision saved.`);
      void load();
    } catch {
      setMsg('The decision could not be saved — network error.');
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  const actionsFor = (row: Row): { label: string; action: string; primary?: boolean }[] => {
    const decided = DECIDED.includes(row.status);
    if (type === 'groomers') {
      return [
        ...(row.status === 'submitted' ? [{ label: 'Begin review', action: 'begin_review' }] : []),
        ...(!decided ? [{ label: 'Approve & activate', action: 'activate', primary: true }, { label: 'Reject', action: 'reject' }] : []),
      ];
    }
    if (type === 'vets' || type === 'pharmacy') {
      return [
        ...(row.status === 'new' ? [{ label: 'Begin review', action: 'begin_review' }] : []),
        ...(!decided ? [{ label: 'Approve', action: 'approve_application', primary: true }, { label: 'Reject', action: 'reject_application' }] : []),
      ];
    }
    // sellers — feed item decisions, including suspend of approved items
    return row.status === 'approved'
      ? [{ label: 'Suspend', action: 'suspended' }]
      : [
          { label: 'Approve', action: 'approved', primary: true },
          { label: 'Reject', action: 'rejected' },
          { label: 'Suspend', action: 'suspended' },
        ];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">Partner Quick Actions</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              One place to decide partner work. Each type below is its own queue with its own
              decision record — groomer activations, vet and pharmacy credentialing, seller feed items.
            </p>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1 hover:bg-accent" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex border-b border-border px-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-medium cursor-pointer ${type === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <Icon className="size-4" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {msg && <p className="mb-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[13px] text-foreground">{msg}</p>}
          {loading ? (
            <p className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading the queue…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing in this queue. New {type === 'sellers' ? 'seller feed items' : 'partner applications'} appear here as they arrive.
            </p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {rows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{row.sub}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase">{row.status.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-1.5">
                    {actionsFor(row).map((a) => (
                      <button
                        key={a.action}
                        disabled={busyId === row.id}
                        onClick={() => void act(row, a.action)}
                        className={`rounded border px-2.5 py-1 text-xs font-semibold disabled:opacity-40 cursor-pointer ${a.primary ? 'bg-primary text-primary-foreground border-transparent hover:opacity-90' : 'border-border hover:bg-muted'}`}
                      >
                        {a.label}
                      </button>
                    ))}
                    {actionsFor(row).length === 0 && <span className="text-xs text-muted-foreground">Decided</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
