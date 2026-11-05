// J2 · A/B tests — deterministic assignment. Same subject key always
// buckets the same way for a given test (FNV-1a hash, no DB, no randomness).
export function bucketFor(testId: string, subjectKey: string): number {
  const s = `${testId}:${subjectKey}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 100;
}
export function assignVariant(test: { id: string; traffic_split: number }, subjectKey: string): "control" | "variant" {
  const split = Math.min(100, Math.max(0, Math.trunc(Number(test.traffic_split) || 0)));
  return bucketFor(test.id, subjectKey || "anonymous") < split ? "variant" : "control";
}
export const AB_TEST_STATUSES = ["draft", "running", "paused", "completed"] as const;
export function testIsLive(t: { status: string; starts_at?: string | null; ends_at?: string | null }, now = new Date()): boolean {
  if (t.status !== "running") return false;
  if (t.starts_at && new Date(t.starts_at) > now) return false;
  if (t.ends_at && new Date(t.ends_at) < now) return false;
  return true;
}
