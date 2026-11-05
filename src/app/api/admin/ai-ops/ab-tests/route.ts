import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { AB_TEST_STATUSES } from "@/lib/ai/ab-tests";

export const dynamic = "force-dynamic";

// J2 · AI prompt A/B tests — the store + CRUD over public.ai_ab_tests
// (migration 20261101). Assignment math lives in lib/ai/ab-tests.ts
// (deterministic bucketing); per-variant counts here are counted from the
// recorded assignments (public.ai_ab_assignments), never estimated.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLS = `id, name, prompt_id, control_prompt, variant_prompt, traffic_split,
              status, starts_at, ends_at, created_at, updated_at`;

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: tests } = await c.query(
        `SELECT ${COLS} FROM public.ai_ab_tests WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [tenant]
      );
      const { rows: counts } = await c.query(
        `SELECT test_id::text AS test_id, variant, count(*)::int AS n
           FROM public.ai_ab_assignments WHERE tenant_id = $1
          GROUP BY test_id, variant`,
        [tenant]
      );
      const byTest = new Map<string, { control: number; variant: number }>();
      for (const r of counts) {
        const cur = byTest.get(r.test_id) || { control: 0, variant: 0 };
        if (r.variant === "variant") cur.variant = r.n;
        else cur.control = r.n;
        byTest.set(r.test_id, cur);
      }
      return {
        tests: tests.map((t: any) => ({
          ...t,
          assignment_counts: byTest.get(String(t.id)) || { control: 0, variant: 0 },
        })),
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: "A/B tests failed (is migration 20261101 applied?)" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const name = String(b.name || "").trim();
  const controlPrompt = String(b.control_prompt ?? "");
  const variantPrompt = String(b.variant_prompt ?? "");
  const promptId = b.prompt_id ? String(b.prompt_id) : null;
  const trafficSplit = Math.min(100, Math.max(0, Math.trunc(Number(b.traffic_split ?? 50)) || 0));
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (promptId && !UUID_RE.test(promptId)) {
    return NextResponse.json({ error: "prompt_id must be a uuid" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPgStrict(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.ai_ab_tests
           (tenant_id, name, prompt_id, control_prompt, variant_prompt, traffic_split, created_by)
         VALUES ($1, $2, $3::uuid, $4, $5, $6, $7)
         RETURNING ${COLS}`,
        [tenant, name, promptId, controlPrompt, variantPrompt, trafficSplit, actorId]
      );
      if (!rows[0]) throw new Error("A/B test insert did not land");
      return { test: { ...rows[0], assignment_counts: { control: 0, variant: 0 } } };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: "A/B test create failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const id = String(b.id || "");
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const status = b.status ? String(b.status) : null;
  if (status && !(AB_TEST_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${AB_TEST_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }
  const trafficSplit =
    b.traffic_split === undefined
      ? null
      : Math.min(100, Math.max(0, Math.trunc(Number(b.traffic_split)) || 0));
  const name = b.name !== undefined ? String(b.name).trim() : null;
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `UPDATE public.ai_ab_tests
            SET status = COALESCE($3, status),
                traffic_split = COALESCE($4, traffic_split),
                name = COALESCE(NULLIF($5, ''), name),
                starts_at = CASE WHEN $3 = 'running' AND starts_at IS NULL THEN now() ELSE starts_at END,
                ends_at = CASE WHEN $3 = 'completed' THEN now() ELSE ends_at END,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING ${COLS}`,
        [tenant, id, status, trafficSplit, name]
      );
      return rows[0] ? { test: rows[0] } : { missing: true as const };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ((out as any).missing) return NextResponse.json({ error: "A/B test not found" }, { status: 404 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "A/B test update failed" }, { status: 500 });
  }
}
