import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery, pgExec } from "@/lib/pg";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";

export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/admin/banking/financial-connections/link — persist the bank
// accounts a completed Financial Connections session collected.
//
// The browser returns the FC account objects (id, institution, masked
// number, subtype); each becomes an acct_bank_accounts row with
// provider 'stripe_financial_connections' and provider_account_id set,
// so the Banking accounts tab, transactions and reconcile treat them
// like any other tracked account. Entity + GL 1010 resolution mirrors
// the manual accounts POST (both are NOT NULL with no defaults).
// Duplicates (same provider_account_id) are skipped, never doubled.
// ============================================================================

type FcAccount = {
  id?: string;
  display_name?: string | null;
  institution_name?: string | null;
  last4?: string | null;
  subtype?: string | null;
};

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const accounts: FcAccount[] = Array.isArray(body.accounts) ? body.accounts : [];
  if (accounts.length === 0) {
    return NextResponse.json({ error: "No accounts were collected in the session" }, { status: 400 });
  }
  try {
    const ent = await pgQuery<{ id: string }>(
      `SELECT id::text AS id FROM public.acct_entities
        WHERE is_active = true AND tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [tenant],
    );
    const entityId = ent[0]?.id || null;
    const gl = await pgQuery<{ id: string }>(
      `SELECT id::text AS id FROM public.acct_chart_of_accounts
        WHERE code = '1010' AND tenant_id = $1 LIMIT 1`,
      [tenant],
    );
    const glAccountId = gl[0]?.id || null;
    if (!entityId || !glAccountId) {
      return NextResponse.json(
        { error: "Accounting entity or the 1010 checking GL account is not configured — set up accounting before linking bank accounts" },
        { status: 422 },
      );
    }

    let linked = 0;
    let skipped = 0;
    for (const a of accounts) {
      if (!a.id) { skipped++; continue; }
      const existing = await pgQuery<{ id: string }>(
        `SELECT id::text AS id FROM public.acct_bank_accounts
          WHERE tenant_id = $1 AND provider_account_id = $2 LIMIT 1`,
        [tenant, a.id],
      );
      if (existing[0]) { skipped++; continue; }
      const name = (a.display_name || "").trim()
        || `${(a.institution_name || "Bank").trim()} ${(a.subtype || "account")}`.trim();
      await pgExec(
        `INSERT INTO public.acct_bank_accounts
           (tenant_id, entity_id, name, institution_name, account_type, masked_account_number,
            currency, gl_account_id, provider, provider_account_id, last_sync_at, is_active, metadata)
         VALUES ($1, $2::uuid, $3, $4, $5, $6, 'USD', $7::uuid, 'stripe_financial_connections', $8, now(), true, '{}'::jsonb)`,
        [tenant, entityId, name, a.institution_name || null, (a.subtype || "checking").toLowerCase(), a.last4 || null, glAccountId, a.id],
      );
      linked++;
    }

    const actorId = await getActorIdFromRequest(req).catch(() => null);
    await auditAction({
      action: "fin_bank_fc_link", domain: "acct", tableName: "acct_bank_accounts",
      recordId: null, actorUserId: actorId, ipAddress: req.headers.get("x-forwarded-for"),
      afterData: { linked, skipped },
    }).catch(() => {});

    return NextResponse.json({ ok: true, linked, skipped });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to link accounts" },
      { status: 500 },
    );
  }
}
