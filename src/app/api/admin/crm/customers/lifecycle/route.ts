import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { scoreLifecycleBatch } from "@/lib/admin/lifecycle-scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/crm/customers/lifecycle
// B.1.7/B.1.8 — "Recalculate stages": runs scoreLifecycleBatch over every
// CRM customer in the tenant and applies each scorer suggestion to
// crm_customers.lifecycle_stage. Suggestions of null mean "keep current
// stage" and are never written. The response lists every change as
// old → new so staff can see exactly what the auto-calc did.
// Body: { dryRun?: boolean } — dryRun scores and reports without writing.

interface CustomerRow {
  id: string;
  email: string | null;
  lifecycle_stage: string | null;
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("customers", "write");
  if (gate) return gate;

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;
  const tenant = resolveTenantId(req);

  try {
    const customers = await withPg(async (c) => {
      const r = await c.query(
        `SELECT id::text AS id, email, lifecycle_stage
           FROM public.crm_customers
          WHERE tenant_id = $1
          ORDER BY created_at`,
        [tenant],
      );
      return r.rows as CustomerRow[];
    });
    if (!customers) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const scores = await scoreLifecycleBatch(customers.map((c) => c.id));

    const changes: { id: string; email: string | null; from: string | null; to: string }[] = [];
    for (const cust of customers) {
      const suggested = scores[cust.id]?.suggestedStage ?? null;
      if (suggested && suggested !== cust.lifecycle_stage) {
        changes.push({ id: cust.id, email: cust.email, from: cust.lifecycle_stage, to: suggested });
      }
    }

    if (!dryRun && changes.length > 0) {
      const applied = await withPg(async (c) => {
        let n = 0;
        for (const ch of changes) {
          const r = await c.query(
            `UPDATE public.crm_customers
                SET lifecycle_stage = $3, updated_at = NOW()
              WHERE tenant_id = $1 AND id = $2::uuid`,
            [tenant, ch.id, ch.to],
          );
          n += r.rowCount ?? 0;
        }
        return n;
      });
      if (applied == null) {
        return NextResponse.json({ error: "Database unavailable during write" }, { status: 503 });
      }
    }

    return NextResponse.json({
      data: {
        dryRun,
        total: customers.length,
        changedCount: changes.length,
        changes,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to recalculate lifecycle stages" }, { status: 500 });
  }
}
