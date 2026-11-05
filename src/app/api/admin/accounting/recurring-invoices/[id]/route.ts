import { NextRequest } from "next/server";
import { adminGet, adminUpdate, adminDelete, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";

const TABLE = "acct_recurring_invoices";
const SCHEMA = "public";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  const { id } = await ctx.params;
  return adminGet(TABLE, id, { preGated: true, tenantId: resolveTenantId(req), schema: SCHEMA });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (body.frequency) {
    const freq = String(body.frequency);
    if (!["weekly", "biweekly", "monthly", "quarterly", "semiannual", "annual"].includes(freq)) {
      const { NextResponse } = await import("next/server");
      return NextResponse.json({ error: `Invalid frequency: ${freq}` }, { status: 400 });
    }
  }
  return adminUpdate(TABLE, id, body, { preGated: true, tenantId: resolveTenantId(req), schema: SCHEMA });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const { id } = await ctx.params;
  return adminDelete(TABLE, id, { preGated: true, tenantId: resolveTenantId(req), schema: SCHEMA });
}
