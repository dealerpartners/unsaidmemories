import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/admin/crm/customers/[id]/cases — order cases for the customer
// profile. [id] is the shop customer id (customers.id, the id the profile
// carries and commerce_orders.customer_id holds).
//
// A case matches when it was attached to:
//   • this shop customer id directly, OR
//   • the linked CRM customer id (crm_customers.source_customer_id = [id]
//     or crm_customers.id = [id] when the profile is opened CRM-side), OR
//   • the customer's email (guest orders carry customer_id NULL but the
//     case still copied the order's email).
// Same rows the order detail shows — closing from either surface PATCHes
// /api/admin/orders/cases/[caseId].
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("customers", "read");
  if (gate) return gate;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "customer id required" }, { status: 400 });
  const tenant = resolveTenantId(req);

  const rows = await withPg(async (client) => {
    // Resolve the customer's identities across both stores.
    const ids = new Set<string>([id]);
    let email: string | null = null;
    const shop = await client.query(
      `SELECT email FROM public.customers WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [id, tenant]
    ).catch(() => ({ rows: [] as any[] }));
    if (shop.rows[0]?.email) email = String(shop.rows[0].email).toLowerCase();
    const crm = await client.query(
      `SELECT id::text AS id, email FROM public.crm_customers
        WHERE tenant_id = $1 AND (source_customer_id::text = $2 OR id::text = $2)
        LIMIT 1`,
      [tenant, id]
    ).catch(() => ({ rows: [] as any[] }));
    if (crm.rows[0]?.id) ids.add(String(crm.rows[0].id));
    if (!email && crm.rows[0]?.email) email = String(crm.rows[0].email).toLowerCase();

    const r = await client.query(
      `SELECT id::text AS id, order_id, customer_id, customer_email, subject, reason,
              note, status, resolution_note, created_by, created_at::text AS created_at,
              updated_at::text AS updated_at, closed_at::text AS closed_at, closed_by
         FROM public.order_cases
        WHERE tenant_id = $1
          AND (customer_id = ANY($2::text[])
               OR ($3::text IS NOT NULL AND lower(customer_email) = $3))
        ORDER BY created_at DESC
        LIMIT 200`,
      [tenant, [...ids], email]
    );
    return r.rows;
  });

  return NextResponse.json({ data: rows || [], total: (rows || []).length });
}
