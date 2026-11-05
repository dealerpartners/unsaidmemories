"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Save, X, ChevronUp, ChevronDown } from "lucide-react";

// ============================================================================
// NAVIGATION MENU EDITOR — add/remove/reorder items
// ============================================================================
export function NavigationEditor() {
  const [menus, setMenus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cms/navigation?withItems=true");
      const data = await res.json();
      setMenus(data.menus ?? []);
      if (data.menus?.[0]?.items) setItems(data.menus[0].items);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function moveItem(idx: number, dir: -1 | 1) {
    const newItems = [...items];
    const target = idx + dir;
    if (target < 0 || target >= newItems.length) return;
    [newItems[idx], newItems[target]] = [newItems[target], newItems[idx]];
    setItems(newItems);
  }

  function addItem() {
    setItems([...items, { label: "New Link", href: "/", item_type: "direct_link", sort_order: items.length, status: "active" }]);
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: string, value: string) {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    setItems(newItems);
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>Loading…</div>;

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>Navigation Builder</h2>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "4px 0 0" }}>{menus[0]?.name || "Header Main"} · {items.length} items</p>
        </div>
        <button onClick={addItem} style={{ background: "var(--primary)", color: "var(--primary-foreground)", border: 0, borderRadius: 8, padding: "10px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={14} /> Add Link
        </button>
      </div>

      <div style={{ padding: "16px 28px" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < items.length - 1 ? "1px solid var(--muted)" : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button onClick={() => moveItem(i, -1)} disabled={i === 0} style={{ background: "transparent", border: 0, cursor: i === 0 ? "not-allowed" : "pointer", color: "var(--muted-foreground)", opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
              <button onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} style={{ background: "transparent", border: 0, cursor: i === items.length - 1 ? "not-allowed" : "pointer", color: "var(--muted-foreground)", opacity: i === items.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
            </div>
            <input value={item.label} onChange={e => updateItem(i, "label", e.target.value)} style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }} />
            <input value={item.href} onChange={e => updateItem(i, "href", e.target.value)} style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }} />
            <button onClick={() => removeItem(i)} style={{ background: "transparent", border: 0, color: "var(--destructive)", cursor: "pointer" }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// DESIGN TOKEN EDITOR — add/edit tokens by category
// ============================================================================
export function DesignTokenEditor() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("color");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cms/tokens?category=${category}`);
      const data = await res.json();
      setTokens(data.tokens ?? []);
    } catch {}
    setLoading(false);
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const categories = ["color", "typography", "spacing", "radius", "shadow", "border", "motion"];

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>Design Tokens</h2>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "4px 0 0" }}>{tokens.length} tokens in {category}</p>
      </div>

      <div style={{ padding: "16px 28px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)} style={{
            padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em",
            border: category === cat ? "1px solid var(--primary)" : "1px solid var(--border)", background: category === cat ? "var(--accent)" : "transparent",
            color: category === cat ? "var(--primary)" : "var(--muted-foreground)", cursor: "pointer",
          }}>{cat}</button>
        ))}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>Loading…</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, padding: "20px 28px" }}>
          {tokens.map((t) => (
            <div key={t.id} style={{ padding: "14px", border: "1px solid var(--border)", borderRadius: 10 }}>
              {t.category === "color" && <div style={{ width: "100%", height: 32, borderRadius: 6, background: t.token_value, marginBottom: 8, border: "1px solid var(--border)" }} />}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{t.token_key}</div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "monospace", marginTop: 2 }}>{t.token_value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// GLOBAL COPY EDITOR — edit translatable strings
// ============================================================================
export function GlobalCopyEditor() {
  const [copy, setCopy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/admin/cms/copy").then(r => r.json()).then(d => setCopy(d.copy ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = copy.filter(c => !filter || c.copy_key.toLowerCase().includes(filter.toLowerCase()) || c.copy_value.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>Global Copy & Translations</h2>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "4px 0 0" }}>{copy.length} strings · en-US</p>
      </div>
      <div style={{ padding: "16px 28px", borderBottom: "1px solid var(--border)" }}>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search copy…" style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none" }} />
      </div>
      {loading ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>Loading…</div> : (
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          {filtered.map((c, i) => (
            <div key={c.id} style={{ display: "flex", gap: 16, padding: "14px 28px", borderBottom: i < filtered.length - 1 ? "1px solid var(--muted)" : "none" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", minWidth: 180, fontFamily: "monospace" }}>{c.copy_key}</div>
              <div style={{ flex: 1, fontSize: 12, color: "var(--foreground)" }}>{c.copy_value}</div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{c.status}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
