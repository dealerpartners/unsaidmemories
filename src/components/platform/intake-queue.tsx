"use client";

import { Check, Clock, X, Inbox } from "lucide-react";

/**
 * §0.5 Intake — the For review / Reviewed queue.
 * QB evidence: §F, §N, §O — one email-in address per company,
 * drag-drop upload, and a For review / Reviewed queue.
 * Bills, receipts, and expenses are one pattern, not three.
 *
 * Usage:
 *   <IntakeQueue
 *     items={[{ id: "1", label: "Invoice from Supplier Co", status: "review", source: "email" }]}
 *     onApprove={(id) => console.log(id)}
 *     onReject={(id) => console.log(id)}
 *   />
 */

export type IntakeItem = {
  id: string;
  label: string;
  status: "review" | "approved" | "rejected";
  source?: "email" | "upload" | "api";
  amount?: string;
  date?: string;
  href?: string;
};

export function IntakeQueue({
  items,
  onApprove,
  onReject,
}: {
  items: IntakeItem[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}) {
  const review = items.filter((i) => i.status === "review");
  const approved = items.filter((i) => i.status === "approved");

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      {/* Tabs: For review / Reviewed */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border, #e5e5e5)" }}>
        <div style={{ padding: "12px 20px", fontSize: 12, fontWeight: 700, color: "var(--primary, #007c7d)", borderBottom: "2px solid var(--primary, #007c7d)" }}>
          For review ({review.length})
        </div>
        <div style={{ padding: "12px 20px", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground, #706d7c)" }}>
          Reviewed ({approved.length})
        </div>
      </div>

      {/* Items */}
      <div style={{ maxHeight: 500, overflowY: "auto" }}>
        {review.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
              borderBottom: "1px solid var(--border, #f5f5f5)",
            }}
          >
            <Inbox size={16} style={{ color: "var(--muted-foreground, #9b97a8)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <a
                href={item.href}
                style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground, #171717)", textDecoration: "none" }}
              >
                {item.label}
              </a>
              <div style={{ fontSize: 10, color: "var(--muted-foreground, #9b97a8)", marginTop: 2 }}>
                {item.source === "email" ? "📧 " : item.source === "upload" ? "📎 " : "🔗 "}
                {item.date && new Date(item.date).toLocaleDateString()}
                {item.amount && ` · ${item.amount}`}
              </div>
            </div>
            <button
              onClick={() => onReject?.(item.id)}
              style={{ background: "none", border: "1px solid var(--border, #e5e5e5)", borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "#c0392b", fontSize: 11, fontWeight: 600 }}
            >
              <X size={12} style={{ display: "inline", marginRight: 4 }} /> Reject
            </button>
            <button
              onClick={() => onApprove?.(item.id)}
              className="adm-btn adm-btn-primary"
              style={{ fontSize: 11 }}
            >
              <Check size={12} style={{ display: "inline", marginRight: 4 }} /> Approve
            </button>
          </div>
        ))}
        {review.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground, #9b97a8)", fontSize: 13 }}>
            <Clock size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
            <div>Nothing waiting for review.</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Email files to your intake address or drag-drop to upload.</div>
          </div>
        )}
      </div>
    </div>
  );
}
