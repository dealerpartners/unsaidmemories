// Shop listing pagination helpers. Pure functions only, safe to import
// from server pages and from the client PLP alike.

/** Per-page options offered on shop listing pages. */
export const PER_PAGE_OPTIONS = [25, 50, 100] as const;
export type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];
export const DEFAULT_PER_PAGE: PerPageOption = 25;

/** Only 25 / 50 / 100 are accepted; anything else falls back to 25. */
export function parsePerPage(value: string | string[] | undefined | null): PerPageOption {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = raw == null ? NaN : parseInt(raw, 10);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n)
    ? (n as PerPageOption)
    : DEFAULT_PER_PAGE;
}

/** Page numbers start at 1; anything invalid falls back to 1. */
export function parsePage(value: string | string[] | undefined | null): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = raw == null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function totalPages(total: number, perPage: number): number {
  return total > 0 ? Math.ceil(total / perPage) : 1;
}

export function clampPage(page: number, pages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, pages));
}

export type PageItem = number | "…";

/**
 * Windowed page list for the numbered control. Always includes the
 * first page, the last page, and the current page plus its neighbors;
 * gaps collapse to an ellipsis. Small page counts render in full.
 */
export function pageWindow(page: number, pages: number): PageItem[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const near = new Set<number>([1, pages, page - 1, page, page + 1]);
  const nums = [...near].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: PageItem[] = [];
  let prev = 0;
  for (const n of nums) {
    if (prev && n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}
