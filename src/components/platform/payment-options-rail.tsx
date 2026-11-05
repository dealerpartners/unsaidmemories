"use client";

import { useState } from "react";

/**
 * §0.7 Payments Plumbing — the payment options rail.
 * QB evidence: §A3, §U, §L2, §M — the deposit destination is set ONCE
 * in payments setup; per-record payment options are toggles
 * (Invoice total / Deposit / Discount / Shipping fee / Late fees);
 * payouts are their own tracked surface; bill pay reads the ACH stored
 * on the vendor record.
 *
 * Usage:
 *   <PaymentOptionsRail
 *     options={[
 *       { key: "total", label: "Invoice total", amount: 1200, enabled: true },
 *       { key: "deposit", label: "Deposit", amount: 600, enabled: false },
 *     ]}
     onChange={(opts) => console.log(opts)}
 *   />
 */

export type PaymentOption = {
  key: string;
  label: string;
  amount?: number;
  enabled?: boolean;
};

export function PaymentOptionsRail({
  options,
  onChange,
}: {
  options: PaymentOption[];
  onChange?: (options: PaymentOption[]) => void;
}) {
  const [opts, setOpts] = useState(options);

  function toggle(key: string) {
    const next = opts.map((o) => (o.key === key ? { ...o, enabled: !o.enabled } : o));
    setOpts(next);
    onChange?.(next);
  }

  const total = opts.filter((o) => o.enabled).reduce((s, o) => s + (o.amount || 0), 0);

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border, #e5e5e5)" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--foreground, #171717)" }}>
          Payment Options
        </h3>
      </div>

      <div>
        {opts.map((opt) => (
          <label
            key={opt.key}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
              borderBottom: "1px solid var(--border, #f5f5f5)", cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={opt.enabled || false}
              onChange={() => toggle(opt.key)}
            />
            <span style={{ flex: 1, fontSize: 13, color: "var(--foreground, #171717)" }}>{opt.label}</span>
            {opt.amount !== undefined && (
              <span style={{ fontSize: 12, fontWeight: 600, color: opt.enabled ? "var(--primary, #007c7d)" : "var(--muted-foreground, #9b97a8)" }}>
                ${opt.amount.toLocaleString()}
              </span>
            )}
          </label>
        ))}
      </div>

      <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border, #e5e5e5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground, #171717)" }}>Total</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: "var(--primary, #007c7d)" }}>
            ${total.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
