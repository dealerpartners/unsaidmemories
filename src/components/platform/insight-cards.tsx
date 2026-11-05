"use client";

/**
 * §0.4 Overview — insight cards.
 * QB evidence: §B — P&L and Expenses cards on Home.
 *
 * Usage:
 *   <InsightCards cards={[
 *     { label: "Revenue (MTD)", value: "$12,400", trend: "+8%", trendDir: "up" },
 *   ]} />
 */

export type InsightCard = {
  label: string;
  value: string;
  sub?: string;
  trend?: string;
  trendDir?: "up" | "down";
  href?: string;
};

export function InsightCards({ cards }: { cards: InsightCard[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: 12, marginBottom: 24 }}>
      {cards.map((card) => (
        <a
          key={card.label}
          href={card.href}
          className="adm-card"
          style={{
            padding: "16px 20px", textDecoration: "none", cursor: card.href ? "pointer" : "default",
            transition: "border-color .12s",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)" }}>
            {card.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--foreground, #171717)", letterSpacing: "-.03em", margin: "4px 0 0" }}>
            {card.value}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            {card.trend && (
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: card.trendDir === "up" ? "var(--primary, #007c7d)" : "#c0392b",
              }}>
                {card.trendDir === "up" ? "↑" : "↓"} {card.trend}
              </span>
            )}
            {card.sub && (
              <span style={{ fontSize: 11, color: "var(--muted-foreground, #9b97a8)" }}>{card.sub}</span>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
