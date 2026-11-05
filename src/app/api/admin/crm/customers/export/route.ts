import { NextRequest, NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId, listCustomers, customerName } from "@/lib/crm/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/crm/customers/export — the customer list as a CSV
 * download, honoring the same view/search/type/stage filters as
 * /admin/customers. Server-side like the ERP orders export (the
 * accounting pages' client-side CsvButton only ever sees one
 * loaded page; this exports the whole filtered view, capped at
 * 500 rows per download).
 */
export async function GET(req: NextRequest) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;

  const db = getDb();
  const tenantId = await getTenantId(db);
  const sp = req.nextUrl.searchParams;
  const filters = {
    view: sp.get("view") || "all",
    type: sp.get("type") || undefined,
    stage: sp.get("stage") || undefined,
    q: sp.get("q") || undefined,
    sort: sp.get("sort") || "newest",
  };

  const rows: any[] = [];
  for (let page = 1; page <= 5 && rows.length < 500; page++) {
    const result = await listCustomers(db, tenantId, { ...filters, page, perPage: 100 });
    rows.push(...result.customers);
    if (rows.length >= result.total || result.customers.length === 0) break;
  }

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = [
    "name", "email", "phone", "type", "stage", "city", "state", "country",
    "lifetime_value", "total_spend_365d", "outstanding_balance",
    "customer_since", "last_activity_at",
  ];
  const lines = rows.map((c) =>
    [
      customerName(c), c.email, c.phone || c.mobile_phone, c.customer_type,
      c.lifecycle_stage, c.city, c.state, c.country, c.lifetime_value,
      c.total_spend_365d, c.outstanding_balance, c.customer_since, c.last_activity_at,
    ].map(esc).join(","),
  );
  const csv = [header.join(","), ...lines].join("\n") + "\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="customers.csv"',
    },
  });
}
