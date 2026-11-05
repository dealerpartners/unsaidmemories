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

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const row = await withPg(async (c) => {
    const { rows } = await c.query(
      `UPDATE public.acct_bank_accounts
          SET name = COALESCE($3, name),
              institution_name = COALESCE($4, institution_name),
              account_type = COALESCE($5, account_type),
              masked_account_number = COALESCE($6, masked_account_number),
              is_active = COALESCE($7, is_active),
              updated_at = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING id, name, institution_name, account_type, masked_account_number, is_active`,
      [id, tenant, body.name || null, body.institution_name || null,
       body.account_type || null, body.masked_account_number || null,
       body.is_active === undefined ? null : !!body.is_active]
    );
    return rows[0] || null;
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ account: row });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const { id } = await ctx.params;
  // Soft-deactivate — never delete financial records.
  await withPg(async (c) => {
    await c.query(
      `UPDATE public.acct_bank_accounts SET is_active = false, updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenant]
    );
  });
  return NextResponse.json({ ok: true });
}
