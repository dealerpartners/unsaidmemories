"use client";

import { useState } from "react";
import { Plus, Trash2, Tag } from "lucide-react";

/**
 * §0.6 Managed Vocabularies — types, tags, categories, custom fields.
 * QB evidence: §B3 — the gear menu's LISTS column is where types, tags,
 * categories, and custom fields live; forms consume them through pickers
 * that can add inline (§V) and through per-record toggles defaulted from
 * settings (§T3).
 *
 * Usage:
 *   <ManagedVocab
 *     title="Customer Types"
 *     items={[{ id: "1", label: "VIP", color: "#007c7d" }]}
 *     onAdd={(label) => console.log(label)}
 *     onDelete={(id) => console.log(id)}
 *   />
 */

export type VocabItem = {
  id: string;
  label: string;
  color?: string;
  count?: number;
};

export function ManagedVocab({
  title,
  items,
  onAdd,
  onDelete,
}: {
  title: string;
  items: VocabItem[];
  onAdd?: (label: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  function handleAdd() {
    if (label.trim()) {
      onAdd?.(label.trim());
      setLabel("");
      setAdding(false);
    }
  }

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border, #e5e5e5)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--foreground, #171717)" }}>{title}</h3>
        <button onClick={() => setAdding(true)} className="adm-btn" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <Plus size={10} /> Add
        </button>
      </div>

      <div>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
              borderBottom: "1px solid var(--border, #f5f5f5)",
            }}
          >
            <Tag size={12} style={{ color: item.color || "var(--muted-foreground, #9b97a8)" }} />
            <span style={{ flex: 1, fontSize: 13, color: "var(--foreground, #171717)" }}>{item.label}</span>
            {item.count !== undefined && (
              <span style={{ fontSize: 10, color: "var(--muted-foreground, #9b97a8)" }}>{item.count}</span>
            )}
            <button
              onClick={() => onDelete?.(item.id)}
              style={{ background: "none", border: 0, cursor: "pointer", padding: 0, color: "#c0392b", opacity: 0.6 }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <div style={{ padding: 16, display: "flex", gap: 8 }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="New item name…"
            style={{
              flex: 1, padding: "8px 12px", border: "1px solid var(--border, #e5e5e5)",
              borderRadius: 6, fontSize: 13, outline: "none",
            }}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button onClick={handleAdd} className="adm-btn adm-btn-primary" style={{ fontSize: 11 }}>Add</button>
          <button onClick={() => setAdding(false)} className="adm-btn" style={{ fontSize: 11 }}>Cancel</button>
        </div>
      )}

      {items.length === 0 && !adding && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground, #9b97a8)", fontSize: 12 }}>
          No {title.toLowerCase()} yet.
        </div>
      )}
    </div>
  );
}
