'use client';

import { useEffect, useRef, useState } from 'react';

interface SearchHit {
  id: string;
  [key: string]: any;
}

interface TypeResult {
  type: string;
  data: SearchHit[];
  total: number;
}

const TYPE_LABELS: Record<string, string> = {
  customers: 'Customers',
  appointments: 'Appointments',
  invoices: 'Invoices',
  payments: 'Payments',
  messages: 'Messages',
  documents: 'Documents',
};

// Titles/subtitles read the REAL row fields of the searched tables
// (see SEARCH_CONFIG in /api/admin/search — the previous field names
// didn't exist, so hits rendered "Unknown — Appointment" and blanks).
function hitTitle(type: string, hit: SearchHit): string {
  switch (type) {
    case 'customers':
      return `${hit.first_name || ''} ${hit.last_name || ''}`.trim() || hit.email || hit.id;
    case 'appointments':
      return hit.appointment_number ? `Appointment ${hit.appointment_number}` : `Appointment ${String(hit.id).slice(0, 8)}`;
    case 'invoices':
      return hit.number || `Invoice ${String(hit.id).slice(0, 8)}`;
    case 'payments':
      return `${hit.payment_number || 'Payment'} — $${hit.amount ?? '?'}`;
    case 'messages':
      return hit.subject || `Message ${String(hit.id).slice(0, 8)}`;
    case 'documents':
      return hit.name || hit.id;
    default:
      return hit.name || hit.id;
  }
}

function hitSubtitle(type: string, hit: SearchHit): string {
  switch (type) {
    case 'customers':
      return [hit.email, hit.phone].filter(Boolean).join(' · ');
    case 'appointments':
      return [hit.status, hit.starts_at ? new Date(hit.starts_at).toLocaleDateString() : ''].filter(Boolean).join(' · ');
    case 'invoices':
      return [hit.status, hit.total != null ? `$${hit.total}` : ''].filter(Boolean).join(' · ');
    case 'payments':
      return [hit.status, hit.processor_transaction_id || hit.external_reference || ''].filter(Boolean).join(' · ');
    case 'messages':
      return [hit.from_address, hit.created_at ? new Date(hit.created_at).toLocaleDateString() : ''].filter(Boolean).join(' · ');
    case 'documents':
      return [hit.status, hit.mime_type || ''].filter(Boolean).join(' · ');
    default:
      return '';
  }
}

export function AdminSearch({ query, onNavigate }: { query: string; onNavigate?: (type: string, id: string, hit: SearchHit) => void }) {
  const [results, setResults] = useState<TypeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}&type=all`);
        const j = await r.json();
        setResults((j.results || []).filter((t: TypeResult) => t.data.length > 0));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (query.trim().length < 2) return null;

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
        Search Results {loading && <span className="normal-case font-normal">— searching…</span>}
      </p>
      {!loading && results.length === 0 && (
        <p className="text-[13px] text-muted-foreground px-2">No matches found.</p>
      )}
      {results.map((group) => (
        <div key={group.type} className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground px-2">
            {TYPE_LABELS[group.type] || group.type} ({group.total})
          </p>
          {group.data.map((hit) => (
            <button
              key={hit.id}
              onClick={() => onNavigate?.(group.type, hit.id, hit)}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground text-foreground transition-colors border border-transparent hover:border-border cursor-pointer"
            >
              <div className="text-[13px] font-medium truncate">{hitTitle(group.type, hit)}</div>
              <div className="text-[11px] text-muted-foreground truncate">{hitSubtitle(group.type, hit)}</div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
