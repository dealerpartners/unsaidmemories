"use client";

import { useState } from "react";
import { Repeat, Calendar, Clock, Check } from "lucide-react";

/**
 * §0.11 Recurring Templates — any transaction becomes a template.
 * QB evidence: §P — Template name · Type · create-days-in-advance ·
 * Interval builder · Start · End — with Autopay offered inside the
 * template where money moves automatically.
 *
 * Usage:
 *   <RecurringTemplate
 *     templateName="Monthly rent"
 *     interval="monthly"
 *     onCreate={(config) => console.log(config)}
 *   />
 */

export type IntervalType = "daily" | "weekly" | "monthly" | "yearly";

export type RecurringConfig = {
  templateName: string;
  interval: IntervalType;
  intervalValue: number; // every N days/weeks/months/years
  startDate: string;
  endDate?: string;
  createDaysInAdvance: number;
  autopay: boolean;
};

export function RecurringTemplate({
  templateName: initialName = "",
  interval: initialInterval = "monthly",
  onCreate,
}: {
  templateName?: string;
  interval?: IntervalType;
  onCreate?: (config: RecurringConfig) => void;
}) {
  const [config, setConfig] = useState<RecurringConfig>({
    templateName: initialName,
    interval: initialInterval,
    intervalValue: 1,
    startDate: "",
    endDate: "",
    createDaysInAdvance: 7,
    autopay: false,
  });

  function update<K extends keyof RecurringConfig>(key: K, value: RecurringConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function handleCreate() {
    if (config.templateName.trim() && config.startDate) {
      onCreate?.(config);
    }
  }

  return (
    <div className="adm-card" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <Repeat size={16} style={{ color: "var(--primary, #007c7d)" }} />
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--foreground, #171717)" }}>
          Recurring Template
        </h3>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {/* Template name */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)", display: "block", marginBottom: 4 }}>
            Template name
          </label>
          <input
            value={config.templateName}
            onChange={(e) => update("templateName", e.target.value)}
            placeholder="e.g. Monthly office rent"
            style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
        </div>

        {/* Interval builder (§P) */}
        <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)", display: "block", marginBottom: 4 }}>
              Every
            </label>
            <input
              type="number"
              min={1}
              value={config.intervalValue}
              onChange={(e) => update("intervalValue", Number(e.target.value))}
              style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 8, fontSize: 13, outline: "none" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)", display: "block", marginBottom: 4 }}>
              Interval
            </label>
            <select
              value={config.interval}
              onChange={(e) => update("interval", e.target.value as IntervalType)}
              style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 8, fontSize: 13, outline: "none" }}
            >
              <option value="daily">Day(s)</option>
              <option value="weekly">Week(s)</option>
              <option value="monthly">Month(s)</option>
              <option value="yearly">Year(s)</option>
            </select>
          </div>
        </div>

        {/* Start / End */}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)", display: "block", marginBottom: 4 }}>
              <Calendar size={10} style={{ display: "inline", marginRight: 4 }} /> Start
            </label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => update("startDate", e.target.value)}
              style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 8, fontSize: 13, outline: "none" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)", display: "block", marginBottom: 4 }}>
              End (optional)
            </label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => update("endDate", e.target.value)}
              style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 8, fontSize: 13, outline: "none" }}
            />
          </div>
        </div>

        {/* Create days in advance (§P) */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)", display: "block", marginBottom: 4 }}>
            <Clock size={10} style={{ display: "inline", marginRight: 4 }} /> Create days in advance
          </label>
          <input
            type="number"
            min={0}
            value={config.createDaysInAdvance}
            onChange={(e) => update("createDaysInAdvance", Number(e.target.value))}
            style={{ width: 120, padding: "10px 14px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
          <span style={{ fontSize: 10, color: "var(--muted-foreground, #9b97a8)", marginLeft: 8 }}>
            Days before the due date
          </span>
        </div>

        {/* Autopay (§P — offered inside the template) */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={config.autopay}
            onChange={(e) => update("autopay", e.target.checked)}
          />
          <span style={{ fontSize: 13, color: "var(--foreground, #171717)" }}>
            Enable autopay — charge automatically on the due date
          </span>
        </label>

        <button
          onClick={handleCreate}
          className="adm-btn adm-btn-primary"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
          disabled={!config.templateName.trim() || !config.startDate}
        >
          <Check size={12} /> Save template
        </button>
      </div>
    </div>
  );
}
