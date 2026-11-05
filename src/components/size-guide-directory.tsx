"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { drinkwareDims, sizeGuideCharts, sizeGuideDirectory } from "@/lib/size-guides";
import "./size-guide.css";

/**
 * The size-guide directory — the owner's structure: search on top,
 * departments as expandable cards, categories inside them, and one
 * link per product guide (each guide is a real route, /size-guide/
 * <slug> — the pattern that turns the taxonomy into guide pages).
 * Drinkware dimensions close the page as a plain table.
 */
const DEPT_NUMBERS: Record<string, string> = {
  Clothing: "01",
  "Hoodies & Sweatshirts": "02",
  "Baby & Toddler": "03",
  Kids: "04",
};

export function SizeGuideDirectory() {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase().trim();

  const { groups, total } = useMemo(() => {
    const dir = sizeGuideDirectory();
    let n = 0;
    const filtered = dir
      .map((d) => ({
        department: d.department,
        categories: d.categories
          .map((c) => ({
            name: c.name,
            charts: c.charts.filter(
              (ch) =>
                !q ||
                [ch.name, ch.category, ch.intro, ch.department]
                  .join(" ")
                  .toLowerCase()
                  .includes(q),
            ),
          }))
          .filter((c) => c.charts.length > 0),
      }))
      .filter((d) => d.categories.length > 0);
    for (const d of filtered) for (const c of d.categories) n += c.charts.length;
    return { groups: filtered, total: n };
  }, [q]);

  return (
    <div>
      <div className="sg-controls">
        <label className="sg-search-wrap">
          <span className="sg-search-icon" aria-hidden="true">⌕</span>
          <input
            className="sg-search"
            type="search"
            placeholder="Search a product, style or model…"
            aria-label="Search size guides"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="sg-result-count" aria-live="polite">
          {total} product {total === 1 ? "guide" : "guides"}
        </div>
      </div>

      {groups.map((d) => {
        const deptCount = d.categories.reduce((a, c) => a + c.charts.length, 0);
        return (
          <section key={d.department} className="sg-section">
            <div className="sg-section-head">
              <h2>{d.department}</h2>
              <span className="sg-rule" />
            </div>
            <div className="sg-dept-grid">
              <details className="sg-dept-card" open={q.length > 0}>
                <summary className="sg-dept-summary">
                  <span className="sg-dept-icon">{DEPT_NUMBERS[d.department] ?? ""}</span>
                  <span>
                    <span className="sg-dept-title">{d.department}</span>
                    <span className="sg-dept-sub">
                      {d.categories.length} product categories · {deptCount} size guides
                    </span>
                  </span>
                  <span className="sg-plus" aria-hidden="true" />
                </summary>
                <div className="sg-dept-content">
                  {d.categories.map((c) => (
                    <details key={c.name} className="sg-category-card" open={q.length > 0}>
                      <summary className="sg-category-summary">
                        <span>{c.name}</span>
                        <span className="sg-category-count">
                          {c.charts.length} {c.charts.length === 1 ? "product" : "products"}
                        </span>
                        <span className="sg-category-chevron" aria-hidden="true">＋</span>
                      </summary>
                      <div className="sg-category-products">
                        {c.charts.map((ch) => (
                          <Link key={ch.id} className="sg-product-link" href={`/size-guide/${ch.slug}`}>
                            <span>
                              {ch.name}
                              <small>{ch.variant}</small>
                            </span>
                            <span aria-hidden="true">↗</span>
                          </Link>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            </div>
          </section>
        );
      })}

      {total === 0 ? (
        <div className="sg-empty">No matching size guides. Try another search.</div>
      ) : null}

      <section className="sg-section">
        <div className="sg-section-head">
          <h2>Drinkware</h2>
          <span className="sg-rule" />
        </div>
        <h4 className="sg-chart-name">{drinkwareDims.title}</h4>
        <p className="sg-chart-basis">{drinkwareDims.basis}</p>
        <div className="sg-table-wrap">
          <table className="sg-table">
            <thead>
              <tr>
                <th scope="col">Size</th>
                <th scope="col">Height</th>
                <th scope="col">Diameter</th>
              </tr>
            </thead>
            <tbody>
              {drinkwareDims.rows.map((r) => (
                <tr key={r.size}>
                  <td>{r.size}</td>
                  <td>{r.height}</td>
                  <td>{r.diameter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="sg-sr-only">{sizeGuideCharts.length} product guides in total.</p>
    </div>
  );
}
