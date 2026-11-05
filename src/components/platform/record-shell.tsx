"use client";

import { X } from "lucide-react";

/**
 * §0.2 Record Page — the shared record shell.
 * QB evidence: §T3, §L2 — one record, several renderings.
 * Parties open as a right rail with section-jump icons and Save pinned.
 * Transactions open full-canvas with VIEW TABS.
 * × returns to exactly where you were (§M).
 *
 * Usage:
 *   <RecordShell
 *     title="Invoice #1042"
 *     layout="full-canvas"
 *     onBack={() => router.push("/admin/accounting/invoices")}
 *     tabs={[{ label: "Edit", key: "edit" }, { label: "Email", key: "email" }, { label: "PDF", key: "pdf" }]}
 *     activeTab="edit"
 *     onTabChange={(key) => setTab(key)}
 *   >
 *     {children}
 *   </RecordShell>
 */

export type RecordTab = {
  label: string;
  key: string;
  badge?: string;
};

export function RecordShell({
  title,
  subtitle,
  layout = "full-canvas",
  onBack,
  tabs,
  activeTab,
  onTabChange,
  children,
  saveSlot,
}: {
  title: string;
  subtitle?: string;
  layout?: "full-canvas" | "right-rail";
  onBack?: () => void;
  tabs?: RecordTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  children: React.ReactNode;
  saveSlot?: React.ReactNode;
}) {
  return (
    <div className="adm-record-shell" style={{ minHeight: "calc(100vh - 56px)" }}>
      {/* Header */}
      <div
        className="adm-record-header"
        style={{
          display: "flex", alignItems: "center", gap: 16, padding: "16px 24px",
          borderBottom: "1px solid var(--border, #e5e5e5)",
          position: "sticky", top: 0, zIndex: 20,
          background: "var(--card, #fff)",
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "none", border: 0, cursor: "pointer", padding: 6,
              color: "var(--muted-foreground, #706d7c)", borderRadius: 6,
            }}
            aria-label="Back"
          >
            <X size={18} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--foreground, #171717)", letterSpacing: "-.02em" }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 12, color: "var(--muted-foreground, #706d7c)", margin: "2px 0 0" }}>{subtitle}</p>
          )}
        </div>
        {saveSlot}
      </div>

      {/* View tabs (§T3 — the invoice's Edit / Email / Payor / PDF) */}
      {tabs && tabs.length > 0 && (
        <div
          className="adm-view-tabs"
          style={{
            display: "flex", gap: 0, padding: "0 24px",
            borderBottom: "1px solid var(--border, #e5e5e5)",
            background: "var(--card, #fff)",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange?.(tab.key)}
              style={{
                padding: "10px 16px", fontSize: 12, fontWeight: 600,
                color: activeTab === tab.key ? "var(--primary, #007c7d)" : "var(--muted-foreground, #706d7c)",
                borderBottom: activeTab === tab.key ? "2px solid var(--primary, #007c7d)" : "2px solid transparent",
                background: "none", border: 0, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                transition: "color .15s, border-color .15s",
              }}
            >
              {tab.label}
              {tab.badge && (
                <span
                  style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 99,
                    background: "var(--accent, #f0fafa)", color: "var(--primary, #007c7d)",
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div
        className="adm-record-body"
        style={{
          display: layout === "right-rail" ? "grid" : "block",
          gridTemplateColumns: layout === "right-rail" ? "1fr 280px" : "none",
          gap: 0,
        }}
      >
        <div style={{ padding: 24, overflow: "auto" }}>{children}</div>
        {layout === "right-rail" && (
          <div
            className="adm-right-rail"
            style={{
              borderLeft: "1px solid var(--border, #e5e5e5)",
              padding: "24px 16px",
              position: "sticky", top: 0, alignSelf: "start",
              maxHeight: "calc(100vh - 56px)", overflow: "auto",
            }}
          >
            <RightRailNav />
          </div>
        )}
      </div>
    </div>
  );
}

function RightRailNav() {
  const sections = [
    { label: "Details", key: "details" },
    { label: "Activity", key: "activity" },
    { label: "Notes", key: "notes" },
    { label: "Attachments", key: "attachments" },
    { label: "Tasks", key: "tasks" },
  ];
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #9b97a8)", marginBottom: 8 }}>
        Sections
      </div>
      {sections.map((s) => (
        <a
          key={s.key}
          href={`#${s.key}`}
          style={{
            padding: "8px 12px", fontSize: 12, fontWeight: 500,
            color: "var(--foreground, #171717)", textDecoration: "none",
            borderRadius: 6, transition: "background .12s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent, #f0fafa)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}

export { ViewTabs } from "./view-tabs";
