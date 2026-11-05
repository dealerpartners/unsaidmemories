"use client";

import { useState } from "react";
import type { SizeGuideChart } from "@/lib/size-guides";
import "./size-guide.css";

/**
 * One product's size chart with the inches/centimetres toggle —
 * the owner's conversion rules: linear values convert (1 in =
 * 2.54 cm), ranges convert per number, weights and "—" never do,
 * and inch fractions (9 ⅜) convert too.
 */
function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function convertValue(v: string, kind: "in" | "range" | "weight", unit: "in" | "cm"): string {
  if (v === "—" || kind === "weight" || unit === "in") return v;
  if (kind === "range") {
    return v.replace(/(\d+(?:\.\d+)?)/g, (n) => fmt(Number(n) * 2.54));
  }
  const frac = v.match(/^(\d+)\s+⅜$/);
  if (frac) return fmt((Number(frac[1]) + 0.375) * 2.54);
  const n = Number(v.replace("⅜", ".375"));
  if (!Number.isNaN(n)) return fmt(n * 2.54);
  return v;
}

export function SizeGuideTable({ chart }: { chart: SizeGuideChart }) {
  const [unit, setUnit] = useState<"in" | "cm">("in");
  const unitLabel = unit === "cm" ? "Centimetres" : "Inches";
  return (
    <div>
      <div className="sg-unit-switch" role="group" aria-label="Measurement units">
        <button type="button" aria-pressed={unit === "in"} onClick={() => setUnit("in")}>
          Inches
        </button>
        <button type="button" aria-pressed={unit === "cm"} onClick={() => setUnit("cm")}>
          Centimetres
        </button>
      </div>
      <div className="sg-table-wrap">
        <table className="sg-table">
          <caption className="sg-sr-only">
            {chart.name} size chart in {unitLabel.toLowerCase()}
          </caption>
          <thead>
            <tr>
              <th scope="col">{unitLabel}</th>
              {chart.sizes.map((s) => (
                <th key={s} scope="col">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {r.values.map((v, i) => (
                  <td key={i}>{convertValue(v, r.kind, unit)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sg-chart-note">
        {chart.note}{" "}
        {unit === "cm"
          ? "Linear measurements converted from inches (1 in = 2.54 cm)."
          : "Select centimetres above to view converted linear measurements."}
      </p>
    </div>
  );
}
