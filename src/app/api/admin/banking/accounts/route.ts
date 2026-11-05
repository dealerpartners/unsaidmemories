import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { getPgWithRetry } from "@/lib/pg";
import { MASTER_TENANT_ID } from "@/lib/site-tenant-shared";

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

export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/banking/accounts — manual bank account tracking (3.10 Banking).
// No Plaid/bank-feed integration — accounts are entered and balanced by hand.
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const rows = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT a.id, a.name, a.institution_name, a.account_type,
              a.masked_account_number, a.currency, a.is_active,
              a.last_sync_at, a.provider, a.updated_at AS created_at,
              COALESCE(SUM(t.amount), 0) AS ledger_balance,
              COUNT(t.id)::int AS txn_count
         FROM public.acct_bank_accounts a
         LEFT JOIN public.acct_bank_transactions t
           ON t.bank_account_id = a.id AND t.tenant_id = a.tenant_id
        WHERE a.tenant_id = $1
        GROUP BY a.id
        ORDER BY a.is_active DESC, a.name`,
      [tenant]
    );
    return rows;
  });
  return NextResponse.json({ accounts: rows ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const out = await withPg(async (c) => {
    // acct_bank_accounts.entity_id and gl_account_id are NOT NULL with no
    // defaults — the previous INSERT omitted both and could only ever fail
    // against the live schema (verified 2026-10-13: 23502 on entity_id).
    // Resolve them from real rows: the tenant's own legal entity (falling
    // back to the platform entity) and the tenant's 1010 Checking Account
    // GL account (falling back to the platform chart's 1010).
    const PLATFORM_TENANT = MASTER_TENANT_ID;
    const ent = await c.query(
      `SELECT id FROM public.acct_entities
        WHERE is_active = true AND (tenant_id = $1 OR tenant_id = $2)
        ORDER BY (tenant_id = $1) DESC, created_at ASC LIMIT 1`,
      [tenant, PLATFORM_TENANT]
    );
    const entityId = ent.rows[0]?.id || null;
    const gl = await c.query(
      `SELECT id FROM public.acct_chart_of_accounts
        WHERE code = '1010' AND (tenant_id = $1 OR tenant_id = $2)
        ORDER BY (tenant_id = $1) DESC LIMIT 1`,
      [tenant, PLATFORM_TENANT]
    );
    const glAccountId = gl.rows[0]?.id || null;
    if (!entityId || !glAccountId) {
      return { error: "No legal entity or checking GL account (1010) is configured for this tenant — set them up in Books before adding a bank account." };
    }
    const { rows } = await c.query(
      `INSERT INTO public.acct_bank_accounts
         (tenant_id, entity_id, name, institution_name, account_type, masked_account_number, currency, is_active, gl_account_id, provider, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,'manually',$9)
       RETURNING id, name, institution_name, account_type, masked_account_number, currency, is_active`,
      [
        tenant, entityId, name,
        body.institution_name || body.institution || null,
        body.account_type || "checking",
        body.masked_account_number || body.last_four || null,
        body.currency || "USD",
        glAccountId,
        JSON.stringify({ notes: body.notes || null }),
      ]
    );
    if (!rows[0]) return { error: "Bank account insert did not land", insertFailed: true };
    return { account: rows[0] };
  });
  if (!out) return NextResponse.json({ error: "Failed to add bank account" }, { status: 500 });
  if ((out as any).insertFailed) return NextResponse.json({ error: (out as any).error }, { status: 500 });
  if ((out as any).error) return NextResponse.json({ error: (out as any).error }, { status: 422 });
  return NextResponse.json({ account: (out as any).account }, { status: 201 });
}
