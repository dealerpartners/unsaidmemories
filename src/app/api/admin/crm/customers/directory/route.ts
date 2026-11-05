import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireAdminApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/crm/customers/directory
// The Customers module directory, sourced ENTIRELY from crm_customers
// (master registry) — not the shop `customers` store. Every derived
// field is a real aggregate over live tables:
//
//   lifetimeValue → SUM(commerce_payments.amount) for succeeded/captured
//                   payments carrying this customer_id. Only 7 of 34
//                   payments carry a customer_id, so most customers
//                   provably show $0. The crm_customers.lifetime_value
//                   column is $0 for every row (verified live), so the
//                   payments ledger is the only source that proves any
//                   value; where it proves none, the value is 0 — never
//                   stitched from the shop store's totalSpent.
//   balance       → COMPUTED, the same figure the customer detail
//                   view shows (customer-metrics.ts →
//                   computeOutstandingBalance): SUM(total − paid −
//                   credited − deposit_paid) over OPEN
//                   acct_ar_invoices for the customer's stored-key
//                   identity set { crm_customers.id,
//                   crm_customers.source_customer_id } — matched
//                   directly on the invoice, or via the AR customer
//                   whose external_customer_id is one of those ids.
//                   The crm_customers.outstanding_balance column is
//                   not maintained and disagreed with the detail page
//                   (list said $0 while the detail showed real AR).
//   pets          → crm_party_dependents link rows. There is no
//                   dependent-record table in the schema, so name and
//                   breed are null; relationship/is_primary are real.
//   lastVisit     → crm_customers.last_visit_at.
//   appointments  → NO appointments table exists in the schema (verified
//                   against the live catalog 2026-11-02): the count is 0
//                   and next/last appointment fields are null until an
//                   appointments entity is built. crm_appointment_
//                   services is an orphan line-item table (0 rows, its
//                   appointment_id references no parent table).
//   assignedStaff → assigned_staff_id / preferred_staff_id staff row.
//                   Null when no real assignment exists.
//   locationId    → crm_customers.preferred_location_id (null for all
//                   current rows — a location filter then truthfully
//                   matches nothing until locations are assigned).
export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const out = await withPg(async (client) => {
    const { rows } = await client.query(
      `SELECT c.id::text AS id,
              NULLIF(trim(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), '') AS name,
              c.email, c.phone, c.mobile_phone,
              c.address_line1, c.city, c.state, c.postal_code,
              c.lifecycle_stage, c.customer_type, c.is_active,
              c.created_at, c.customer_since,
              COALESCE((SELECT SUM(i.total - i.amount_paid - i.amount_credited - i.deposit_paid)
                          FROM public.acct_ar_invoices i
                         WHERE i.tenant_id = c.tenant_id
                           AND i.status NOT IN ('paid','void','cancelled','closed','rejected')
                           AND (i.source_customer_id = ANY(ARRAY[c.id::text, c.source_customer_id::text])
                                OR i.customer_id IN (SELECT ac.id FROM public.acct_customers ac
                                                      WHERE ac.tenant_id = c.tenant_id
                                                        AND ac.external_customer_id = ANY(ARRAY[c.id::text, c.source_customer_id::text])))), 0)::float8 AS balance,
              c.lead_source_id::text AS lead_source_id,
              c.preferred_location_id::text AS location_id,
              (SELECT l.name FROM public.crm_locations l WHERE l.id = c.preferred_location_id) AS location_name,
              COALESCE((SELECT SUM(p.amount) FROM public.commerce_payments p
                         WHERE p.customer_id = c.id AND p.tenant_id = c.tenant_id
                           AND p.status IN ('succeeded','captured')), 0)::float8 AS lifetime_value,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('name', NULL::text, 'breed', NULL::text, 'relationship', cp.relationship, 'is_primary', cp.is_primary) ORDER BY cp.created_at)
                          FROM public.crm_party_dependents cp
                         WHERE cp.customer_id = c.id AND cp.tenant_id = c.tenant_id), '[]'::jsonb) AS pets,
              COALESCE((SELECT jsonb_agg(t.name ORDER BY t.name)
                          FROM public.crm_customer_tag_assignments ta
                          JOIN public.crm_tags t ON t.id = ta.tag_id AND t.tenant_id = c.tenant_id
                         WHERE ta.customer_id = c.id AND ta.tenant_id = c.tenant_id), '[]'::jsonb) AS tags,
              0 AS appointment_count,
              COALESCE((SELECT jsonb_agg(cs.ch ORDER BY cs.ch) FROM (
                          SELECT 'shop' AS ch WHERE EXISTS (SELECT 1 FROM public.commerce_orders o
                            WHERE o.tenant_id = c.tenant_id AND (o.customer_id::text = c.id::text
                              OR (c.email IS NOT NULL AND o.customer_email = c.email)))
                          UNION ALL SELECT 'in-store' WHERE EXISTS (SELECT 1 FROM public.commerce_sales s
                            WHERE s.customer_id::text = c.id::text AND s.tenant_id = c.tenant_id)
                        ) cs), '[]'::jsonb) AS channels,
              c.last_visit_at,
              NULL::timestamptz AS next_appt_at,
              NULL::text AS next_service,
              NULL::text AS last_service,
              COALESCE(
                (SELECT NULLIF(trim(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')), '')
                   FROM public.crm_staff s WHERE s.id = c.assigned_staff_id),
                (SELECT NULLIF(trim(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')), '')
                   FROM public.crm_staff s WHERE s.id = c.preferred_staff_id)) AS assigned_staff,
              COALESCE(c.assigned_staff_id, c.preferred_staff_id)::text AS staff_id,
              (c.next_follow_up_at IS NOT NULL AND c.next_follow_up_at <= now()) AS followup_due
         FROM public.crm_customers c
        WHERE c.tenant_id = $1
        ORDER BY c.created_at DESC
        LIMIT 500`,
      [tenant],
    );
    return NextResponse.json({ data: rows, total: rows.length });
  });
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 });
}
