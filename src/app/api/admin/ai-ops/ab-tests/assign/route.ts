import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { assignVariant, testIsLive } from "@/lib/ai/ab-tests";

export const dynamic = "force-dynamic";

// J2 · Assignment endpoint. Buckets a subject into control/variant with
// the deterministic lib (same subject + test = same bucket, always) and
// RECORDS the assignment the first time it happens for a live test
// (ai_ab_assignments, UNIQUE per test+subject — the first assignment
// sticks). A test that is not live serves 'control' and records nothing.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const testId = String(b.test_id || "");
  const subjectKey = String(b.subject_key || "").trim();
  if (!UUID_RE.test(testId)) return NextResponse.json({ error: "test_id must be a uuid" }, { status: 400 });
  if (!subjectKey) return NextResponse.json({ error: "subject_key is required" }, { status: 400 });
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT id, traffic_split, status, starts_at, ends_at
           FROM public.ai_ab_tests WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, testId]
      );
      const test = rows[0];
      if (!test) return { missing: true as const };
      const live = testIsLive(test);
      if (!live) return { variant: "control" as const, live: false, recorded: false };
      const { rows: existing } = await c.query(
        `SELECT variant FROM public.ai_ab_assignments WHERE test_id = $1::uuid AND subject_key = $2 LIMIT 1`,
        [testId, subjectKey]
      );
      if (existing[0]) {
        return { variant: existing[0].variant as "control" | "variant", live: true, recorded: false };
      }
      const variant = assignVariant(test, subjectKey);
      await c.query(
        `INSERT INTO public.ai_ab_assignments (tenant_id, test_id, subject_key, variant)
         VALUES ($1, $2::uuid, $3, $4) ON CONFLICT (test_id, subject_key) DO NOTHING`,
        [tenant, testId, subjectKey, variant]
      );
      return { variant, live: true, recorded: true };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ((out as any).missing) return NextResponse.json({ error: "A/B test not found" }, { status: 404 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "assignment failed" }, { status: 500 });
  }
}
