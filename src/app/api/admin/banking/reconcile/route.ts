import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { getPgWithRetry } from "@/lib/pg";

// Pool-backed runner (fn(client) → result). Failures THROW: a failed
// read or write must surface as an error response, never as null —
// callers turned null into fabricated empty lists, false 404s and
// false 201s. A callback that legitimately finds nothing returns its
// own null/empty as a RESOLVED value. withPg's session-pooler Client
// cannot establish SSL from this runtime (the EMAXCONNSESSION/SSL
// failure class lib/pg was built to fix); the transaction pooler in
// lib/pg works everywhere and a checked-out PoolClient has the same
// .query() surface as a Client, so no call site below changes.
async function withPg<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await getPgWithRetry();
  try { return await fn(client); }
  finally { client.release(); }
}
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";

export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/banking/reconcile — match a bank transaction to a journal entry.
// POST { transaction_id, journal_entry_id? } → marks reconciled.
// POST { transaction_id, unreconcile: true } → back to unmatched.
// ============================================================================

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const txnId = body.transaction_id;
  if (!txnId) return NextResponse.json({ error: "transaction_id required" }, { status: 400 });

  const row = await withPg(async (c) => {
    if (body.unreconcile) {
      const { rows } = await c.query(
        `UPDATE public.acct_bank_transactions
            SET match_status = 'unmatched', matched_journal_line_id = NULL
          WHERE id = $1 AND tenant_id = $2 RETURNING id, match_status`,
        [txnId, tenant]
      );
      return rows[0] || null;
    }
    // If a journal entry is given, verify it exists under this tenant.
    let matchedLine: string | null = null;
    if (body.journal_entry_id) {
      const je = await c.query(
        `SELECT id FROM public.acct_journal_entries WHERE id = $1 AND tenant_id = $2`,
        [body.journal_entry_id, tenant]
      );
      if (je.rows.length === 0) return { error: "journal entry not found" };
      matchedLine = body.journal_entry_id;
    }
    const { rows } = await c.query(
      `UPDATE public.acct_bank_transactions
          SET match_status = 'reconciled', matched_journal_line_id = COALESCE($3, matched_journal_line_id)
        WHERE id = $1 AND tenant_id = $2 RETURNING id, match_status, matched_journal_line_id`,
      [txnId, tenant, matchedLine]
    );
    return rows[0] || null;
  });
  if (!row) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if ((row as any).error) return NextResponse.json({ error: (row as any).error }, { status: 400 });
  // SA-85 audit: every match / unmatch lands in acct_audit_log.
  await auditAction({
    action: body.unreconcile ? "bank_unreconcile" : "bank_reconcile",
    domain: "acct",
    tableName: "acct_bank_transactions",
    recordId: String(txnId),
    afterData: { match_status: (row as any).match_status, matched_journal_line_id: (row as any).matched_journal_line_id ?? null },
    actorUserId: await getActorIdFromRequest(req),
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return NextResponse.json({ transaction: row });
}
