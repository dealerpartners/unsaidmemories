import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

const SEL = `id, jurisdiction, tax_type, state_code, rate, tax_code, classification, auto_calc, is_active`;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const row = await withPg(async (c) => {
    const { rows } = await c.query(
      `UPDATE public.acct_tax_rules
          SET jurisdiction = COALESCE($3, jurisdiction),
              tax_type = COALESCE($4, tax_type),
              state_code = COALESCE($5, state_code),
              rate = COALESCE($6, rate),
              tax_code = COALESCE($7, tax_code),
              classification = COALESCE($8, classification),
              auto_calc = COALESCE($9, auto_calc),
              is_active = COALESCE($10, is_active),
              updated_at = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING ${SEL}`,
      [id, tenant, body.jurisdiction || null, body.tax_type || null,
       body.state_code || null, body.rate === undefined ? null : Number(body.rate),
       body.tax_code || null, body.classification || null,
       body.auto_calc === undefined ? null : !!body.auto_calc,
       body.is_active === undefined ? null : !!body.is_active]
    );
    return rows[0] || null;
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ rule: row });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const { id } = await ctx.params;
  // Soft-deactivate — never delete tax history.
  await withPg(async (c) => {
    await c.query(
      `UPDATE public.acct_tax_rules SET is_active = false, updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenant]
    );
  });
  return NextResponse.json({ ok: true });
}
