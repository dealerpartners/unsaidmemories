/**
 * /api/admin/analytics — Analytics & Reports data.
 * GET (no params)     — dashboard aggregates (real rows only).
 * GET ?report=orders|revenue|customers|accounts&days=30 — daily series
 *                       for the Reports Explorer (+ CSV via &format=csv).
 *
 * Website visit counts are NOT fabricated: this database has no visit
 * tracking, so the dashboard reports the measurable funnel — accounts
 * created, carts started, orders placed — and labels it as such.
 *
 * Orders/revenue source (2026-10-31, Analytics unification CP1): the real
 * order ledger is erp_orders — the admin Orders module and the customer
 * account read it, and all of its rows carry this tenant. This route
 * previously computed revenue and the daily series from the separate
 * native `orders` table (21 rows) and only counted erp_orders into the
 * total; aggregates, series and recent orders now all read erp_orders.
 * See ANALYTICS-CENSUS.md at the repo root.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireModuleApi } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { listAuthUsers } from "@/lib/admin/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("analytics", "read");
  if (mod) return mod;

  const db = createServerClient();
  const tenantId = getTenantId();
  const report = req.nextUrl.searchParams.get("report");
  const days = Math.min(90, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") || "30", 10) || 30));
  const since = new Date(Date.now() - days * 86400000);

  try {
    if (report) {
      const series = new Map<string, number>();
      for (let i = 0; i < days; i++) series.set(dayKey(new Date(since.getTime() + i * 86400000)), 0);
      const add = (created: string | null, amount = 1) => {
        if (!created) return;
        const k = dayKey(new Date(created));
        if (series.has(k)) series.set(k, (series.get(k) ?? 0) + amount);
      };
      if (report === "orders" || report === "revenue") {
        const { data } = await db
          .from("erp_orders")
          .select("order_date, total")
          .eq("tenant_id", tenantId)
          .gte("order_date", since.toISOString());
        for (const o of data ?? []) add(o.order_date as string, report === "revenue" ? Number(o.total ?? 0) : 1);
      } else if (report === "customers") {
        const { data } = await db
          .from("crm_customers")
          .select("created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", since.toISOString());
        for (const c of data ?? []) add(c.created_at as string);
      } else if (report === "accounts") {
        const users = await listAuthUsers();
        for (const u of users) if (new Date(u.created_at) >= since) add(u.created_at);
      } else {
        return NextResponse.json({ error: "Unknown report." }, { status: 400 });
      }
      const rows = [...series.entries()].map(([day, value]) => ({ day, value }));
      if (req.nextUrl.searchParams.get("format") === "csv") {
        const csv = "day,value\n" + rows.map((r) => `${r.day},${r.value}`).join("\n");
        return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename=${report}-${days}d.csv` } });
      }
      return NextResponse.json({ report, days, rows });
    }

    // ── Dashboard aggregates ──────────────────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const since30 = new Date(Date.now() - 30 * 86400000);

    const [erpOrdersRes, customersRes, productsRes, cartsRes, invRes, ticketsRes, catalogRes, authUsers] = await Promise.all([
      db.from("erp_orders").select("id, order_number, total, status, order_date").eq("tenant_id", tenantId).order("order_date", { ascending: false }).limit(1000),
      db.from("crm_customers").select("id, created_at").eq("tenant_id", tenantId).limit(2000),
      db.from("products").select("id, status").eq("tenant_id", tenantId).limit(2000),
      db.from("carts").select("id, created_at").eq("tenant_id", tenantId).limit(2000),
      db.from("erp_inventory_balances").select("id, on_hand").eq("tenant_id", tenantId).limit(2000),
      db.from("support_tickets").select("id, status, created_at").eq("tenant_id", tenantId).limit(500),
      db.from("supplier_catalog_products").select("id", { count: "exact", head: true }),
      listAuthUsers().catch(() => []),
    ]);

    const orders = erpOrdersRes.data ?? [];
    const revenueToday = orders
      .filter((o) => new Date(o.order_date as string) >= todayStart)
      .reduce((s, o) => s + Number(o.total ?? 0), 0);
    const revenue30 = orders
      .filter((o) => new Date(o.order_date as string) >= since30)
      .reduce((s, o) => s + Number(o.total ?? 0), 0);
    const newCustomers30 = (customersRes.data ?? []).filter((c) => new Date(c.created_at as string) >= since30).length;
    const accounts30 = authUsers.filter((u) => new Date(u.created_at) >= since30).length;
    const carts30 = (cartsRes.data ?? []).filter((c) => new Date(c.created_at as string) >= since30).length;
    const orders30 = orders.filter((o) => new Date(o.order_date as string) >= since30).length;
    const lowStock = (invRes.data ?? []).filter((i) => Number(i.on_hand ?? 0) <= 5).length;
    const openTickets = (ticketsRes.data ?? []).filter((t) => !["resolved", "closed"].includes(String(t.status ?? "").toLowerCase())).length;

    return NextResponse.json({
      kpis: {
        revenueToday,
        revenue30,
        ordersTotal: orders.length,
        orders30,
        newCustomers30,
        totalCustomers: (customersRes.data ?? []).length,
        accountsCreated30: accounts30,
        totalAccounts: authUsers.length,
        carts30,
        checkoutConversion30: carts30 > 0 ? Math.round((orders30 / carts30) * 1000) / 10 : null,
        productsPublished: (productsRes.data ?? []).filter((p) => p.status === "published").length,
        productsTotal: (productsRes.data ?? []).length,
        catalogProducts: catalogRes.count ?? 0,
        lowStockCount: lowStock,
        openTickets,
      },
      recentOrders: orders.slice(0, 8).map((o) => ({
        id: o.id,
        order_number: o.order_number,
        total: Number(o.total ?? 0),
        status: o.status,
        created_at: o.order_date,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analytics failed" }, { status: 500 });
  }
}
