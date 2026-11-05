// GS1 GTIN validation — real check-digit algorithm (ISO/IEC 15420 / GS1).
// Weights: the digit immediately left of the check digit is weighted 3,
// then weights alternate 1, 3, 1, … moving left. Check = (10 - sum%10) % 10.
export type GtinType = "GTIN-8" | "UPC-A" | "GTIN-13" | "GTIN-14";
export const GTIN_TYPE_BY_LENGTH: Record<number, GtinType> = { 8: "GTIN-8", 12: "UPC-A", 13: "GTIN-13", 14: "GTIN-14" };

export function normalizeGtin(raw: string): string {
  return String(raw ?? "").replace(/[\s-]/g, "");
}
export function computeGtinCheckDigit(body: string): number | null {
  if (!/^[0-9]+$/.test(body)) return null;
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const fromRight = body.length - 1 - i; // 0 = digit immediately left of check
    sum += Number(body[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}
export type GtinValidation = { valid: boolean; normalized: string; type: GtinType | null; error: string | null };
export function validateGtin(raw: string): GtinValidation {
  const normalized = normalizeGtin(raw);
  if (!/^[0-9]+$/.test(normalized)) return { valid: false, normalized, type: null, error: "GTIN must contain digits only (spaces and hyphens are stripped)." };
  const type = GTIN_TYPE_BY_LENGTH[normalized.length] ?? null;
  if (!type) return { valid: false, normalized, type: null, error: `GTIN length must be 8, 12, 13, or 14 digits (got ${normalized.length}).` };
  const expected = computeGtinCheckDigit(normalized.slice(0, -1));
  if (expected === null || expected !== Number(normalized[normalized.length - 1]))
    return { valid: false, normalized, type, error: `Check digit mismatch: expected ${expected} for body ${normalized.slice(0, -1)}.` };
  return { valid: true, normalized, type, error: null };
}
export const isValidGtin = (raw: string) => validateGtin(raw).valid;
