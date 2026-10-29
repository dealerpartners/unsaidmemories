// Shared search-input helpers for /api/search.
// Pure functions (no I/O) so they can be unit-tested without a Next build.

export const MAX_QUERY_LENGTH = 200;
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

// Strip control characters, trim, cap length.
export function cleanQuery(v: string | null): string {
  if (!v) return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_QUERY_LENGTH);
}

// Clamp to [1, MAX_LIMIT], defaulting when absent/invalid.
export function cleanLimit(v: string | null): number {
  const n = parseInt(v ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), MAX_LIMIT);
}
