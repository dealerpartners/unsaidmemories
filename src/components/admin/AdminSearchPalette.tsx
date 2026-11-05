"use client";

/**
 * AdminSearchPalette — the global ⌘K command palette (owner audit item:
 * global search). Wired to the existing /api/admin/search route (which
 * fans out across customers, orders, products, sellers, invoices,
 * payments, appointments, messages, documents). Opens from the topbar
 * Search button or ⌘K; Esc closes; Enter / click navigates.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import "./admin-search.css";

interface ResultItem {
  type: string;
  id: string;
  label: string;
  sub?: string;
  href: string;
}

const TYPE_LABEL: Record<string, string> = {
  customers: "Customer",
  orders: "Order",
  products: "Product",
  sellers: "Seller",
  invoices: "Invoice",
  payments: "Payment",
  appointments: "Appointment",
  messages: "Message",
  documents: "Document",
};

function toItems(type: string, rows: any[]): ResultItem[] {
  return (rows || []).map((r) => {
    const id = String(r.id ?? "");
    let label = "";
    let sub = "";
    let href = "/admin";
    switch (type) {
      case "customers":
        label = `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email || id;
        sub = r.email || r.phone || "";
        href = `/admin/customers/${id}`;
        break;
      case "orders":
        label = r.customer_email || r.email || `Order ${id.slice(0, 8)}`;
        sub = r.tracking_number || r.id || "";
        href = `/admin/orders/${id}`;
        break;
      case "products":
        label = r.name || id;
        sub = r.brand || "";
        href = `/admin/products/${id}`;
        break;
      case "sellers":
        label = r.display_name || r.email || id;
        sub = r.email || "";
        href = `/admin/sellers/${id}`;
        break;
      case "invoices":
        label = r.invoice_number || `Invoice ${id.slice(0, 8)}`;
        sub = r.external_id || "";
        href = "/admin/accounting/invoices";
        break;
      case "payments":
        label = r.payment_number || `Payment ${id.slice(0, 8)}`;
        sub = r.processor_transaction_id || "";
        href = "/admin/accounting/payments";
        break;
      case "appointments":
        label = r.appointment_number || "Appointment";
        sub = r.internal_notes || "";
        href = "/admin/crm/appointments";
        break;
      case "messages":
        label = r.subject || "(no subject)";
        sub = r.from_address || "";
        href = "/admin/messages";
        break;
      case "documents":
        label = r.name || id;
        sub = "";
        href = "/admin/crm/documents";
        break;
    }
    return { type, id, label, sub, href };
  });
}

export default function AdminSearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Focus + reset on open; clear on close.
  useEffect(() => {
    if (open) {
      setQ("");
      setItems([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}&type=all&limit=5`, { signal: ctrl.signal });
        const j = await res.json();
        // type=all returns { results: [{type, data, total}, ...], type, total }
        const groups: any[] = Array.isArray(j) ? j : (j.results ?? []);
        const flat: ResultItem[] = [];
        for (const g of groups) {
          if (g && g.data) flat.push(...toItems(g.type, g.data));
        }
        setItems(flat.slice(0, 24));
        setActive(0);
      } catch {
        /* aborted or network — leave list as-is */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [q, open]);

  // Keyboard: Esc close, ↑↓ move, Enter go.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === "Enter" && items[active]) {
        e.preventDefault();
        router.push(items[active].href);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, active, onClose, router]);

  const grouped = useMemo(() => {
    const map = new Map<string, ResultItem[]>();
    for (const it of items) {
      if (!map.has(it.type)) map.set(it.type, []);
      map.get(it.type)!.push(it);
    }
    return [...map.entries()];
  }, [items]);

  if (!open) return null;

  const go = (href: string) => { router.push(href); onClose(); };

  return (
    <div className="adm-search-wrap" role="dialog" aria-modal="true" aria-label="Search the admin">
      <div className="adm-search-backdrop" onClick={onClose} />
      <div className="adm-search-panel">
        <div className="adm-search-input-row">
          <Search size={18} style={{ color: "var(--muted-foreground)" }} />
          <input
            ref={inputRef}
            className="adm-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customers, orders, products, sellers, invoices…"
            aria-label="Search query"
          />
          <kbd className="adm-search-kbd">Esc</kbd>
          <button type="button" className="adm-search-x" onClick={onClose} aria-label="Close search"><X size={16} /></button>
        </div>
        <div className="adm-search-results">
          {loading && <div className="adm-search-state">Searching…</div>}
          {!loading && q.trim().length >= 2 && items.length === 0 && (
            <div className="adm-search-state">No results for “{q}”.</div>
          )}
          {!loading && q.trim().length < 2 && (
            <div className="adm-search-state">Type at least two characters to search across the admin.</div>
          )}
          {grouped.map(([type, rows]) => (
            <div key={type} className="adm-search-group">
              <div className="adm-search-group-label">{TYPE_LABEL[type] || type}</div>
              {rows.map((it) => {
                const idx = items.indexOf(it);
                const isActive = idx === active;
                return (
                  <button
                    key={it.type + it.id}
                    type="button"
                    className={`adm-search-item${isActive ? " active" : ""}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(it.href)}
                  >
                    <span className="adm-search-item-label">{it.label}</span>
                    {it.sub && <span className="adm-search-item-sub">{it.sub}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
