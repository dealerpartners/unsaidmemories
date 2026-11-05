/**
 * sortByDateTime — stable date/time ordering for portal list tables.
 *
 * Pure + exported (same pattern as paginateRows in TablePagination) so
 * the ordering can be exercised directly under bun against live-shaped
 * data. Returns a NEW array; the input is never mutated.
 *
 * Rows whose timestamp is absent or unparseable sink to the end in
 * BOTH directions — an undated row is never the "earliest" or the
 * "latest" — and equal timestamps keep their incoming order
 * (Array.prototype.sort is stable), so the caller's order (e.g. the
 * appointments API's starts_at ASC) is the tiebreak and the ascending
 * result reproduces it exactly.
 */

export type SortDirection = "asc" | "desc";

/** Parse an ISO-ish date value to epoch ms; null when absent/unparseable. */
export function dateTimeValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

export function sortByDateTime<T>(
  rows: readonly T[],
  getRaw: (row: T) => string | null | undefined,
  direction: SortDirection,
): T[] {
  const dir = direction === "desc" ? -1 : 1;
  return rows
    .map((row) => ({ row, t: dateTimeValue(getRaw(row)) }))
    .sort((a, b) => {
      if (a.t === null && b.t === null) return 0;
      if (a.t === null) return 1;
      if (b.t === null) return -1;
      return (a.t - b.t) * dir;
    })
    .map((x) => x.row);
}
