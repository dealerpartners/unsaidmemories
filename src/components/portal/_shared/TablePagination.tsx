"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * TablePagination — REAL client-side pagination for portal data tables.
 *
 * The math follows the app's established working pattern
 * (financial/DepositsView): pageCount from the REAL filtered total,
 * safePage clamped into range, rows sliced AFTER filter + sort so
 * paging composes on top of whatever the view already computed.
 *
 * The footer chrome mirrors the appointments table design (Show N per
 * page / numbered pages / range label) — except every control here is
 * wired: the select changes the page size, the buttons change the page,
 * and the rendered slice actually changes with them.
 */

export interface PaginatedSlice<T> {
  pagedRows: T[];
  pageCount: number;
  safePage: number;
  /** 1-based index of the first rendered row within the full set (0 when empty). */
  rangeStart: number;
  /** 1-based index of the last rendered row within the full set (0 when empty). */
  rangeEnd: number;
  total: number;
}

/** Pure slicing math — exported so it can be exercised directly in tests. */
export function paginateRows<T>(rows: T[], page: number, pageSize: number): PaginatedSlice<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const startIdx = (safePage - 1) * pageSize;
  const pagedRows = rows.slice(startIdx, startIdx + pageSize);
  return {
    pagedRows,
    pageCount,
    safePage,
    rangeStart: total === 0 ? 0 : startIdx + 1,
    rangeEnd: total === 0 ? 0 : startIdx + pagedRows.length,
    total,
  };
}

export interface UseTablePagination<T> extends PaginatedSlice<T> {
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
}

/**
 * Hook form. `resetDeps` should carry the view's filter/sort state —
 * when any of them change, the page resets to 1 (a fresh filtered set
 * always starts on its first page).
 */
export function useTablePagination<T>(
  rows: T[],
  opts?: { defaultPageSize?: number; resetDeps?: React.DependencyList },
): UseTablePagination<T> {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSizeState] = React.useState(opts?.defaultPageSize ?? 25);

  const resetDeps = opts?.resetDeps;
  React.useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps ?? []);

  const setPageSize = React.useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const slice = paginateRows(rows, page, pageSize);
  return { ...slice, page, setPage, pageSize, setPageSize };
}

/** Page-number window: all pages when few; 1 … c-1 c c+1 … last when many. */
function pageWindow(pageCount: number, current: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set<number>([1, pageCount, current - 1, current, current + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export interface TablePaginationProps {
  total: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  safePage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Plural noun for the range label, e.g. "appointments", "entries". */
  unitLabel: string;
  pageSizeOptions?: number[];
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  total,
  rangeStart,
  rangeEnd,
  pageSize,
  onPageSizeChange,
  safePage,
  pageCount,
  onPageChange,
  unitLabel,
  pageSizeOptions = [25, 50, 100],
}) => {
  return (
    <div className="px-4 py-3 border-t border-border bg-background flex flex-col sm:flex-row items-center justify-between gap-3 text-[13px] text-foreground">
      <div className="flex items-center gap-2">
        <span className="font-semibold uppercase tracking-wider text-[11px]">Show</span>
        <div className="relative">
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="appearance-none bg-card border border-border pl-2.5 pr-7 py-1 text-[13px] text-foreground font-semibold uppercase focus:outline-none cursor-pointer"
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-foreground absolute right-2 top-2 pointer-events-none" />
        </div>
        <span className="font-semibold uppercase tracking-wider text-[11px]">per page</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="px-2 py-1 border border-border text-foreground hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal disabled:hover:border-border uppercase font-semibold text-[11px] transition-colors cursor-pointer disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pageWindow(pageCount, safePage).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="w-7 h-7 flex items-center justify-center text-[13px] text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={
                p === safePage
                  ? "w-7 h-7 border border-border bg-primary text-primary-foreground font-semibold flex items-center justify-center text-[13px]"
                  : "w-7 h-7 border border-border hover:bg-accent/50 text-foreground font-semibold flex items-center justify-center text-[13px] cursor-pointer"
              }
              aria-current={p === safePage ? "page" : undefined}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= pageCount}
          className="px-2 py-1 border border-border text-foreground hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal disabled:hover:border-border uppercase font-semibold text-[11px] transition-colors cursor-pointer disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="text-foreground tabular-nums text-[11px]">
        {total === 0 ? `0 ${unitLabel}` : `${rangeStart} – ${rangeEnd} of ${total} ${unitLabel}`}
      </div>
    </div>
  );
};
