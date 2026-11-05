"use client";

import { Plus, ChevronDown } from "lucide-react";

/**
 * §0.1 Create — per-overview Create-actions row.
 * QB evidence: §C — every overview opens with a Create actions row.
 * QB evidence: §J2 — Favorites (star + drag, cap 10).
 *
 * Sits at the top of every module landing page (dashboard, orders, accounting, etc.)
 * Shows the most-used create actions for that module, with star + quick access.
 */

export type CreateAction = {
  label: string;
  href: string;
  icon?: string;
  primary?: boolean;
};

export function CreateActionsRow({ actions }: { actions: CreateAction[] }) {
  const primary = actions.filter((a) => a.primary);
  const secondary = actions.filter((a) => !a.primary);

  return (
    <div className="adm-create-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {primary.map((action) => (
        <a
          key={action.href}
          href={action.href}
          className="adm-btn adm-btn-primary"
          style={{ gap: 6, display: "inline-flex", alignItems: "center" }}
        >
          <Plus size={14} /> {action.label}
        </a>
      ))}
      {secondary.length > 0 && (
        <details style={{ position: "relative" }}>
          <summary
            className="adm-btn"
            style={{ gap: 6, display: "inline-flex", alignItems: "center", cursor: "pointer", listStyle: "none" }}
          >
            More <ChevronDown size={12} />
          </summary>
          <div
            className="adm-card"
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0,
              minWidth: 200, zIndex: 100, padding: 0, boxShadow: "0 16px 40px rgba(0,0,0,.12)",
            }}
          >
            {secondary.map((action) => (
              <a
                key={action.href}
                href={action.href}
                style={{
                  display: "block", padding: "10px 16px", fontSize: 13,
                  color: "var(--foreground, #171717)", textDecoration: "none",
                  borderBottom: "1px solid var(--border, #e5e5e5)",
                }}
              >
                {action.label}
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
