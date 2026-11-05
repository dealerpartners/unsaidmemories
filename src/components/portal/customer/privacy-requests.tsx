'use client';

// PrivacyRequests — the customer's own door into the §18 privacy
// workflow (POST/GET /api/customer/privacy-requests; the desk works
// the same records from its compliance panel). Two requests a person
// can make about their own data: a copy of it, or its deletion.
//
// The copy on this card is the honest version, shown BEFORE filing:
// a copy covers the support data we hold; deletion erases what the
// law allows erased — records the law requires us to keep (a legal
// hold) are kept, and the request says so when that happens. No
// instant-erasure promise the workflow cannot keep.
import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Download, Trash2, Loader2 } from 'lucide-react';

interface PrivacyRequestRow {
  ticketRef: string;
  requestType: string;
  state: string | null;
  outcome: string | null;
  createdAt: string;
}

const fmtWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })
    : '';

function stateText(r: PrivacyRequestRow): string {
  if (r.state === 'closed') {
    if (r.outcome === 'fulfilled') return r.requestType === 'deletion' ? 'Done — your erasable support data was deleted.' : 'Done — your copy was provided.';
    if (r.outcome === 'partially_fulfilled') return 'Done in part — what could be erased was erased; some records are being kept under a legal hold (below).';
    if (r.outcome === 'denied') return 'Closed — we couldn\'t complete this request; the team explained why in your support inbox.';
    return 'Closed.';
  }
  if (r.state === 'identity_verified') return 'In progress — we\'ve confirmed it\'s you and are preparing it.';
  return 'Received — first we confirm the request really comes from you.';
}

export function PrivacyRequests() {
  const [requests, setRequests] = useState<PrivacyRequestRow[]>([]);
  const [heldRefs, setHeldRefs] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState<'access' | 'deletion' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/privacy-requests', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setRequests(Array.isArray(j.requests) ? j.requests : []);
        setHeldRefs(Array.isArray(j.retainedUnderLegalHold) ? j.retainedUnderLegalHold : []);
      }
    } catch { /* the card still explains; the list just stays empty */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (requestType: 'access' | 'deletion') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/privacy-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Request failed');
      setNotice(`Request filed — your reference is ${j.ticketRef}. We'll work it from your support inbox and update its status here.`);
      setConfirming(null);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" /> Your data &amp; privacy
      </h2>
      <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl">
        You can ask us for a copy of the personal data we hold about you in our support system,
        or ask us to delete it. Either request opens a case with our team — you&apos;ll see its
        status here, and we&apos;ll reply in your support inbox above as it moves.
      </p>

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <Download className="size-4 text-primary" /> A copy of my data
          </h3>
          <p className="text-[13px] text-muted-foreground mt-1">
            The copy covers your support data: your conversations with our team, your support
            requests, and the contact details you&apos;ve shared with us. We prepare it after
            confirming the request really comes from you, and send it to you here in your
            support inbox.
          </p>
          {confirming === 'access' ? (
            <div className="mt-3 flex gap-2">
              <button onClick={() => submit('access')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold disabled:opacity-50 cursor-pointer">
                {busy && <Loader2 className="size-3.5 animate-spin" />} File the request
              </button>
              <button onClick={() => setConfirming(null)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-border text-[13px] text-foreground cursor-pointer">Not now</button>
            </div>
          ) : (
            <button onClick={() => { setConfirming('access'); setError(null); }} className="mt-3 px-3 py-1.5 rounded-lg border border-border text-[13px] font-semibold text-foreground hover:bg-muted cursor-pointer">
              Request a copy
            </button>
          )}
        </div>

        <div className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <Trash2 className="size-4 text-primary" /> Delete my data
          </h3>
          <p className="text-[13px] text-muted-foreground mt-1">
            Deletion removes what we&apos;re allowed to remove: your support conversations and
            the contact record our team keeps. It is <strong>not</strong> instant total erasure —
            the law requires us to keep some records for a time (for example, records tied to a
            legal matter or a payment dispute). Anything under that kind of legal hold stays
            kept, only that; your request will say so, with the hold recorded as the reason.
            This covers your support data — it doesn&apos;t close your shop account or erase
            order history; message us in the inbox above if that&apos;s what you need.
          </p>
          {confirming === 'deletion' ? (
            <div className="mt-3 flex gap-2">
              <button onClick={() => submit('deletion')} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-white text-[13px] font-semibold disabled:opacity-50 cursor-pointer">
                {busy && <Loader2 className="size-3.5 animate-spin" />} File the deletion request
              </button>
              <button onClick={() => setConfirming(null)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-border text-[13px] text-foreground cursor-pointer">Not now</button>
            </div>
          ) : (
            <button onClick={() => { setConfirming('deletion'); setError(null); }} className="mt-3 px-3 py-1.5 rounded-lg border border-border text-[13px] font-semibold text-foreground hover:bg-muted cursor-pointer">
              Request deletion
            </button>
          )}
        </div>
      </div>

      {notice && <p className="mt-3 text-[13px] text-foreground rounded-lg bg-muted px-3 py-2">{notice}</p>}
      {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}

      {loaded && requests.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-[13px] font-semibold text-foreground">Your requests</h3>
          <ul className="mt-2 space-y-2">
            {requests.map((r) => (
              <li key={r.ticketRef} className="text-[13px] text-foreground flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-xs text-muted-foreground">{r.ticketRef}</span>
                <span className="font-medium">{r.requestType === 'deletion' ? 'Deletion' : 'Copy of my data'}</span>
                <span className="text-muted-foreground">filed {fmtWhen(r.createdAt)} — {stateText(r)}</span>
              </li>
            ))}
          </ul>
          {heldRefs.length > 0 && requests.some((r) => r.outcome === 'partially_fulfilled') && (
            <p className="mt-2 text-[13px] text-muted-foreground">
              Records connected with case{heldRefs.length === 1 ? '' : 's'} {heldRefs.join(', ')} are being kept
              under a legal hold — a legal obligation to retain them. Everything else in your
              request was completed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
