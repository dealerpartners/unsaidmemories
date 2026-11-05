"use client";

/**
 * §0.4 Overview — the funnel + tasks pattern.
 * QB evidence: §B, §J1, §J5, §S — every overview is:
 * Create actions row → the money/state funnel for that workflow →
 * a TO-DO list with deadlines → insight cards.
 *
 * Usage:
 *   <OverviewFunnel
 *     stages={[
 *       { label: "Draft", count: 5, amount: 1200 },
 *       { label: "Sent", count: 12, amount: 8400 },
 *       { label: "Paid", count: 8, amount: 5200 },
 *     ]}
 *   />
 */

export type FunnelStage = {
  label: string;
  count?: number;
  amount?: number;
  color?: string;
  href?: string;
};

export function OverviewFunnel({ stages }: { stages: FunnelStage[] }) {
  const total = stages.reduce((s, st) => s + (st.count || 0), 0);
  return (
    <div className="adm-funnel" style={{ display: "flex", gap: 0, marginBottom: 24 }}>
      {stages.map((stage, i) => {
        const pct = total > 0 ? ((stage.count || 0) / total) * 100 : 0;
        return (
          <a
            key={stage.label}
            href={stage.href}
            style={{
              flex: 1, padding: "16px 20px", textDecoration: "none",
              borderRight: i < stages.length - 1 ? "1px solid var(--border, #e5e5e5)" : "none",
              background: stage.color || "var(--card, #fff)",
              cursor: stage.href ? "pointer" : "default",
              transition: "background .12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent, #f8f7fa)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = stage.color || "var(--card, #fff)")}
          >
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)" }}>
              {stage.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--foreground, #171717)", letterSpacing: "-.03em", margin: "4px 0 0" }}>
              {stage.count ?? 0}
            </div>
            {stage.amount !== undefined && (
              <div style={{ fontSize: 11, color: "var(--muted-foreground, #706d7c)", marginTop: 2 }}>
                ${stage.amount.toLocaleString()}
              </div>
            )}
            {/* Progress bar */}
            <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: "var(--border, #e5e5e5)" }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: "var(--primary, #007c7d)" }} />
            </div>
          </a>
        );
      })}
    </div>
  );
}
