"use client";

/**
 * §0.2 Record Page — view tabs (standalone export).
 * QB evidence: §T3 — the invoice's Edit / Email / Payor / PDF renderings.
 * Used by RecordShell or standalone on any record page.
 */

export type ViewTab = {
  label: string;
  key: string;
  badge?: string;
};

export function ViewTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: ViewTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex", gap: 0, padding: "0 24px",
        borderBottom: "1px solid var(--border, #e5e5e5)",
        background: "var(--card, #fff)",
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          style={{
            padding: "10px 16px", fontSize: 12, fontWeight: 600,
            color: active === tab.key ? "var(--primary, #007c7d)" : "var(--muted-foreground, #706d7c)",
            borderBottom: active === tab.key ? "2px solid var(--primary, #007c7d)" : "2px solid transparent",
            background: "none", border: 0, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {tab.label}
          {tab.badge && (
            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 99, background: "var(--accent, #f0fafa)", color: "var(--primary, #007c7d)" }}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
