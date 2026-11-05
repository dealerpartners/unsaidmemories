"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Filter, SlidersHorizontal, CheckSquare, Square, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * §0.3 List System — the ONE list system for the entire platform.
 * QB evidence: §K, §H, §F — status tabs, filter chips with ×,
 * a Filter button, a Customize rail (filter builder with conditions;
 * Columns drag-to-reorder + checkbox; Number format), sortable headers,
 * bulk-select, and one pagination grammar.
 *
 * Usage:
 *   <ListSystem
 *     columns={[
 *       { key: "name", label: "Name", sortable: true },
 *       { key: "status", label: "Status", filterable: true },
 *     ]}
 *     rows={[{ id: "1", name: "Order #1", status: "paid" }]}
 *     tabs={[{ label: "All", key: "all" }, { label: "Paid", key: "paid" }]}
 *     activeTab="all"
 *     onTabChange={(tab) => console.log(tab)}
 *   />
 */

export type ListColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
  render?: (row: any) => React.ReactNode;
};

export type ListTab = {
  label: string;
  key: string;
  count?: number;
};

export type FilterCondition = {
  column: string;
  operator: "contains" | "equals" | "starts_with" | "greater" | "less";
  value: string;
};

export function ListSystem({
  columns,
  rows,
  tabs,
  activeTab = "all",
  onTabChange,
  rowKey = "id",
  onRowClick,
  pageSize = 25,
}: {
  columns: ListColumn[];
  rows: any[];
  tabs?: ListTab[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  rowKey?: string;
  onRowClick?: (row: any) => void;
  pageSize?: number;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showFilter, setShowFilter] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortKey, sortDir]);

  // Filter
  const filtered = useMemo(() => {
    if (filters.length === 0) return sorted;
    return sorted.filter((row) =>
      filters.every((f) => {
        const val = String(row[f.column] ?? "").toLowerCase();
        const target = f.value.toLowerCase();
        switch (f.operator) {
          case "contains": return val.includes(target);
          case "equals": return val === target;
          case "starts_with": return val.startsWith(target);
          case "greater": return Number(val) > Number(target);
          case "less": return Number(val) < Number(target);
          default: return true;
        }
      })
    );
  }, [sorted, filters]);

  // Paginate
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Visible columns
  const visibleColumns = columns.filter((c) => !hiddenColumns.has(c.key));

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === paged.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((r) => r[rowKey])));
    }
  }

  return (
    <div className="adm-list-system">
      {/* Status tabs (§K) */}
      {tabs && tabs.length > 0 && (
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border, #e5e5e5)", marginBottom: 0 }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { onTabChange?.(tab.key); setPage(1); }}
              style={{
                padding: "10px 16px", fontSize: 12, fontWeight: 600,
                color: activeTab === tab.key ? "var(--primary, #007c7d)" : "var(--muted-foreground, #706d7c)",
                borderBottom: activeTab === tab.key ? "2px solid var(--primary, #007c7d)" : "2px solid transparent",
                background: "none", border: 0, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span style={{ fontSize: 10, color: "var(--muted-foreground, #9b97a8)" }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Filter chips + toolbar (§F, §H) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
        <button
          onClick={() => setShowFilter(!showFilter)}
          className="adm-btn"
          style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
        >
          <Filter size={12} /> Filter
        </button>
        <button
          onClick={() => setShowCustomize(!showCustomize)}
          className="adm-btn"
          style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
        >
          <SlidersHorizontal size={12} /> Customize
        </button>

        {/* Active filter chips (§F — with ×) */}
        {filters.map((f, i) => (
          <span
            key={i}
            style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 99,
              background: "var(--accent, #f0fafa)", color: "var(--primary, #007c7d)",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {columns.find((c) => c.key === f.column)?.label} {f.operator} &ldquo;{f.value}&rdquo;
            <button
              onClick={() => setFilters(filters.filter((_, idx) => idx !== i))}
              style={{ background: "none", border: 0, cursor: "pointer", padding: 0, color: "inherit", lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        ))}

        {/* Bulk actions */}
        {selected.size > 0 && (
          <span style={{ fontSize: 11, color: "var(--muted-foreground, #706d7c)" }}>
            {selected.size} selected
          </span>
        )}

        <span style={{ flex: 1 }} />

        {/* Pagination (§K — "1 – 75", "Page 1 of 1") */}
        <span style={{ fontSize: 11, color: "var(--muted-foreground, #706d7c)" }}>
          {filtered.length === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)}`} of {filtered.length}
        </span>
        {totalPages > 1 && (
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="adm-btn" style={{ padding: 6, fontSize: 10 }}>
              <ChevronLeft size={12} />
            </button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="adm-btn" style={{ padding: 6, fontSize: 10 }}>
              <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Filter builder (§H Customize rail — conditions) */}
      {showFilter && (
        <div className="adm-card" style={{ padding: 16, marginBottom: 12 }}>
          <FilterBuilder columns={columns} onAdd={(cond) => { setFilters([...filters, cond]); setShowFilter(false); }} />
        </div>
      )}

      {/* Customize rail (§H — Columns drag-to-reorder + checkbox) */}
      {showCustomize && (
        <div className="adm-card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #9b97a8)", marginBottom: 8 }}>
            Columns
          </div>
          {columns.map((col) => (
            <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!hiddenColumns.has(col.key)}
                onChange={() => {
                  setHiddenColumns((prev) => {
                    const next = new Set(prev);
                    next.has(col.key) ? next.delete(col.key) : next.add(col.key);
                    return next;
                  });
                }}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="adm-table-wrap">
        <table className="adm-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ width: 36, padding: "8px 12px", borderBottom: "1px solid var(--border, #e5e5e5)" }}>
                <button onClick={toggleSelectAll} style={{ background: "none", border: 0, cursor: "pointer", padding: 0, color: "var(--muted-foreground, #706d7c)" }}>
                  {selected.size === paged.length && paged.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
                </button>
              </th>
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  style={{
                    padding: "8px 12px", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: ".08em", color: "var(--muted-foreground, #706d7c)",
                    borderBottom: "1px solid var(--border, #e5e5e5)", textAlign: "left",
                    cursor: col.sortable ? "pointer" : "default",
                    width: col.width,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row) => (
              <tr
                key={row[rowKey]}
                onClick={() => onRowClick?.(row)}
                style={{
                  cursor: onRowClick ? "pointer" : "default",
                  borderBottom: "1px solid var(--border, #f5f5f5)",
                  transition: "background .1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent, #f8f7fa)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "8px 12px" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(row[rowKey]); }}
                    style={{ background: "none", border: 0, cursor: "pointer", padding: 0, color: selected.has(row[rowKey]) ? "var(--primary, #007c7d)" : "var(--muted-foreground, #c5bed8)" }}
                  >
                    {selected.has(row[rowKey]) ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>
                </td>
                {visibleColumns.map((col) => (
                  <td key={col.key} style={{ padding: "8px 12px", fontSize: 13, color: "var(--foreground, #171717)" }}>
                    {col.render ? col.render(row) : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {paged.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground, #9b97a8)", fontSize: 13 }}>
          No records match your filters.
        </div>
      )}
    </div>
  );
}

function FilterBuilder({ columns, onAdd }: { columns: ListColumn[]; onAdd: (cond: FilterCondition) => void }) {
  const [column, setColumn] = useState(columns[0]?.key || "");
  const [operator, setOperator] = useState<FilterCondition["operator"]>("contains");
  const [value, setValue] = useState("");

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select value={column} onChange={(e) => setColumn(e.target.value)} className="adm-select" style={{ fontSize: 12, padding: "6px 10px" }}>
        {columns.filter((c) => c.filterable).map((c) => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </select>
      <select value={operator} onChange={(e) => setOperator(e.target.value as any)} className="adm-select" style={{ fontSize: 12, padding: "6px 10px" }}>
        <option value="contains">Contains</option>
        <option value="equals">Equals</option>
        <option value="starts_with">Starts with</option>
        <option value="greater">Greater than</option>
        <option value="less">Less than</option>
      </select>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Value…"
        style={{ fontSize: 12, padding: "6px 10px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 6, outline: "none" }}
      />
      <button
        onClick={() => { if (value) { onAdd({ column, operator, value }); } }}
        className="adm-btn adm-btn-primary"
        style={{ fontSize: 11 }}
      >
        Add filter
      </button>
    </div>
  );
}
