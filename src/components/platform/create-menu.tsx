"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Star, ChevronDown, Search } from "lucide-react";

/**
 * §0.1 Create — the global create menu.
 * QB evidence: §C — one global menu grouped by noun family.
 *
 * One menu, grouped by entity type (Orders, Customers, Financial, Content).
 * Per-overview Create-actions row sits at the top of every module landing.
 * Favorites (cap 10) are user-customizable (star + drag).
 *
 * Usage:
 *   <CreateMenu items={[
 *     { group: "Orders", label: "New Order", href: "/admin/orders/new", icon: "Package" },
 *     { group: "Customers", label: "New Customer", href: "/admin/customers/new" },
 *   ]} />
 */

export type CreateMenuItem = {
  group: string;
  label: string;
  href: string;
  icon?: string;
  favorite?: boolean;
};

const FAV_KEY = "uns.platform.create.favorites";
const MAX_FAV = 10;

export function CreateMenu({ items }: { items: CreateMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      setFavorites(Array.isArray(saved) ? saved.slice(0, MAX_FAV) : []);
    } catch { /* first load */ }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const groups = Array.from(new Set(items.map((i) => i.group)));
  const filtered = items.filter((i) => !query || i.label.toLowerCase().includes(query.toLowerCase()));
  const favItems = items.filter((i) => favorites.includes(i.href));

  function toggleFav(href: string) {
    setFavorites((prev) => {
      const next = prev.includes(href)
        ? prev.filter((h) => h !== href)
        : [...prev, href].slice(0, MAX_FAV);
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div ref={ref} className="adm-create-menu" style={{ position: "relative", display: "inline-block" }}>
      <button
        className="adm-btn adm-btn-primary"
        onClick={() => setOpen(!open)}
        style={{ gap: 6, display: "flex", alignItems: "center" }}
      >
        <Plus size={14} /> Create <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="adm-card"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0,
            minWidth: 280, zIndex: 100, padding: 0, boxShadow: "0 16px 40px rgba(0,0,0,.12)",
          }}
        >
          {/* Search */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border, #e5e5e5)" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground, #9b97a8)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search create actions…"
                style={{
                  width: "100%", padding: "8px 12px 8px 32px", border: "1px solid var(--border, #e5e5e5)",
                  borderRadius: 8, fontSize: 13, outline: "none", background: "var(--background, #fff)",
                  color: "var(--foreground, #171717)",
                }}
                autoFocus
              />
            </div>
          </div>

          {/* Favorites */}
          {favItems.length > 0 && !query && (
            <div style={{ padding: "8px 0" }}>
              <div style={{ padding: "0 16px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #9b97a8)" }}>
                ★ Favorites
              </div>
              {favItems.map((item) => (
                <CreateMenuRow key={item.href} item={item} isFav onClick={() => { window.location.href = item.href; }} onToggleFav={() => toggleFav(item.href)} />
              ))}
            </div>
          )}

          {/* Groups */}
          {groups.map((group) => {
            const groupItems = filtered.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} style={{ padding: "8px 0", borderTop: favItems.length > 0 && !query ? "1px solid var(--border, #e5e5e5)" : "none" }}>
                <div style={{ padding: "0 16px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #9b97a8)" }}>
                  {group}
                </div>
                {groupItems.map((item) => (
                  <CreateMenuRow
                    key={item.href}
                    item={item}
                    isFav={favorites.includes(item.href)}
                    onClick={() => { window.location.href = item.href; }}
                    onToggleFav={() => toggleFav(item.href)}
                  />
                ))}
              </div>
            );
          })}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground, #9b97a8)", fontSize: 13 }}>
              No create actions match &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateMenuRow({ item, isFav, onClick, onToggleFav }: {
  item: CreateMenuItem;
  isFav: boolean;
  onClick: () => void;
  onToggleFav: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", cursor: "pointer", transition: "background .12s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent, #f0fafa)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
        style={{ background: "none", border: 0, cursor: "pointer", padding: 4, color: isFav ? "var(--primary, #007c7d)" : "var(--muted-foreground, #c5bed8)" }}
        aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
      >
        <Star size={12} fill={isFav ? "currentColor" : "none"} />
      </button>
      <a
        href={item.href}
        onClick={(e) => { e.preventDefault(); onClick(); }}
        style={{ flex: 1, fontSize: 13, color: "var(--foreground, #171717)", fontWeight: 500, textDecoration: "none" }}
      >
        {item.label}
      </a>
    </div>
  );
}
