"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";

/**
 * §0.1 Create — inline picker with "+ Add new".
 * QB evidence: §V/V2 — every picker grows its own list inline.
 * "Category, Preferred supplier, and the account picker" all have + Add new inside.
 *
 * Wraps a select/dropdown with the ability to create a new option on the fly.
 * Used for: customer typeahead, category, supplier, account — any entity picker.
 */

export function InlinePicker<T extends { id: string; label: string }>({
  items,
  value,
  onChange,
  onCreate,
  placeholder = "Search or add new…",
  renderCreateForm,
}: {
  items: T[];
  value?: string;
  onChange?: (id: string) => void;
  onCreate?: (label: string) => Promise<T | null>;
  placeholder?: string;
  renderCreateForm?: () => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingLabel, setCreatingLabel] = useState("");

  const filtered = items.filter((i) => !query || i.label.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = items.some((i) => i.label.toLowerCase() === query.toLowerCase());

  async function handleCreate() {
    if (!onCreate || !creatingLabel.trim()) return;
    const created = await onCreate(creatingLabel.trim());
    if (created) {
      onChange?.(created.id);
      setCreating(false);
      setCreatingLabel("");
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", border: "1px solid var(--border, #e5e5e5)",
          borderRadius: 8, cursor: "pointer", background: "var(--background, #fff)",
          fontSize: 13, color: value ? "var(--foreground, #171717)" : "var(--muted-foreground, #9b97a8)",
        }}
      >
        {items.find((i) => i.id === value)?.label || placeholder}
      </div>

      {open && (
        <div
          className="adm-card"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            zIndex: 100, padding: 0, boxShadow: "0 16px 40px rgba(0,0,0,.12)",
            maxHeight: 320, overflow: "auto",
          }}
        >
          {/* Search */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border, #e5e5e5)", position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground, #9b97a8)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              style={{
                width: "100%", padding: "8px 8px 8px 28px", border: "1px solid var(--border, #e5e5e5)",
                borderRadius: 6, fontSize: 13, outline: "none",
                background: "var(--background, #fff)", color: "var(--foreground, #171717)",
              }}
              autoFocus
            />
          </div>

          {/* Items */}
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => { onChange?.(item.id); setOpen(false); setQuery(""); }}
              style={{
                padding: "10px 14px", fontSize: 13, cursor: "pointer",
                color: "var(--foreground, #171717)", borderBottom: "1px solid var(--border, #f5f5f5)",
                background: item.id === value ? "var(--accent, #f0fafa)" : "transparent",
              }}
            >
              {item.label}
            </div>
          ))}

          {/* Create new */}
          {!exactMatch && query && onCreate && !creating && (
            <div
              onClick={() => { setCreating(true); setCreatingLabel(query); }}
              style={{
                padding: "10px 14px", fontSize: 13, cursor: "pointer",
                color: "var(--primary, #007c7d)", fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Plus size={12} /> Create &ldquo;{query}&rdquo;
            </div>
          )}

          {/* Create form */}
          {creating && renderCreateForm ? (
            <div style={{ padding: 14 }}>
              {renderCreateForm()}
            </div>
          ) : creating ? (
            <div style={{ padding: 14 }}>
              <input
                value={creatingLabel}
                onChange={(e) => setCreatingLabel(e.target.value)}
                placeholder="Name…"
                style={{
                  width: "100%", padding: "8px 12px", border: "1px solid var(--border, #e5e5e5)",
                  borderRadius: 6, fontSize: 13, outline: "none", marginBottom: 8,
                  background: "var(--background, #fff)", color: "var(--foreground, #171717)",
                }}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleCreate} className="adm-btn adm-btn-primary" style={{ fontSize: 12 }}>
                  Save
                </button>
                <button onClick={() => setCreating(false)} className="adm-btn" style={{ fontSize: 12 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {/* Empty */}
          {filtered.length === 0 && !query && (
            <div style={{ padding: 20, textAlign: "center", color: "var(--muted-foreground, #9b97a8)", fontSize: 12 }}>
              No items yet. Search or click &ldquo;Create&rdquo; to add one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
