import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/disputes — real dispute list from commerce_disputes.
// Honest empty state when none exist (no mock data).
//
// Schema note (verified live 2026-10-13): commerce_disputes has NO currency
// or due_at columns — the previous SELECT named both, so the query errored,
// withPg swallowed it, and this route silently returned an empty list
// forever. Select only real columns; due_at is returned as NULL because the
// response shape (ReportsView) carries the field and no due date is stored.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const rows = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT d.id, d.dispute_number, d.reason, d.status,
              d.amount::float AS amount,
              d.opened_at, d.responded_at, d.resolved_at,
              d.processor_dispute_id, d.notes,
              d.payment_id,
              NULL::timestamptz AS due_at
         FROM public.commerce_disputes d
        WHERE d.tenant_id = $1
        ORDER BY d.opened_at DESC NULLS LAST
        LIMIT 100`,
      [tenant]
    );
    return rows;
  });
  return NextResponse.json({ disputes: rows ?? [] });
}
