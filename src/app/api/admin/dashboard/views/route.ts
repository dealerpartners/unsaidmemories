import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { resolveActiveTenantId } from "@/lib/admin/tenant-resolution";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/admin/dashboard/views — the real data behind the Dashboard
// domain views (owner's DASHBOARD_VIEW.html, 2026-11-02). One read for
// /admin (Operations Vitals), /admin/dashboard (Executive), the
// settlements table on /admin/analytics, the three Queues pages, and the
// shell siderail's live Queues counts — so the counts in the rail are
// the counts on the pages, by construction.
//
// Every figure is an aggregate over live tables; each query is wrapped
// so a missing/empty store degrades that element to an honest zero or
// empty list, never a fabricated number:
//   GMV / print runs / SLA  → erp_orders (the canonical order ledger —
//                             see /api/admin/dashboard/kpis header)
//   funnel / overdue        → acct_ar_invoices (balance = total − paid
//                             − credited, status outside paid/void)
//   deposited / settlements → acct_payouts
//   stock alerts            → commerce_inventory_alerts (open rows)
//   support notifications   → support_notifications (read_at IS NULL)
//   tasks                   → crm_tasks (open, high/urgent priority)
//   verifications           → verification_tasks (pending states)
//   customer queue          → customer_notifications (readAt IS NULL)
//   seller queue            → seller_performance_alerts (open) +
//                             verification_tasks, seller names from
//                             public.sellers
//   POD pipelines           → suppliers present in the harvested
//                             catalog (supplier_catalog_products); the
//                             suppliers table carries no connection
//                             state — see the dashboard gap list.
//
// POST { action: "mark-all-resolved" } — resolves the Attention Queue's
// own alert rows: support_notifications are marked read and open
// commerce_inventory_alerts are marked resolved. SLA breaches and CRM
// tasks are NOT touched — they resolve inside their own modules (the
// queue rows link there).
// ============================================================================

type AnyRow = Record<string, any>;

const TERMINAL_OK = ["delivered", "shipped", "cancelled"];
const ACTIVE_RUN = ["pending", "confirmed", "processing", "in_production", "ready_to_ship", "unfulfilled"];
const VERIFY_PENDING = ["pending", "pending_review", "submitted", "in_review"];

const num = (v: unknown) => Number(v ?? 0);

async function buildViews(client: any, tenant: string) {
  const q = async (sql: string, params: unknown[] = [tenant]): Promise<AnyRow[]> => {
    try {
      const r = await client.query(sql, params);
      return r.rows as AnyRow[];
    } catch (e) {
      console.error("[dashboard/views] query failed:", e);
      return [];
    }
  };
  const one = async (sql: string, params: unknown[] = [tenant]): Promise<AnyRow> => (await q(sql, params))[0] ?? {};

  // ── Vitals: GMV ─────────────────────────────────────────────────────
  const gmvRow = await one(
    `SELECT
       COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0)::float AS total,
       COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled' AND order_date >= now() - interval '30 days'), 0)::float AS last30,
       COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled' AND order_date >= now() - interval '60 days' AND order_date < now() - interval '30 days'), 0)::float AS prior30
     FROM public.erp_orders WHERE tenant_id = $1`,
  );
  const gmvTotal = num(gmvRow.total);
  const gmvLast30 = num(gmvRow.last30);
  const gmvPrior30 = num(gmvRow.prior30);
  const gmvDeltaPct = gmvPrior30 > 0 ? Math.round(((gmvLast30 - gmvPrior30) / gmvPrior30) * 1000) / 10 : null;

  // ── Vitals: print runs + SLA ────────────────────────────────────────
  const slaRow = await one(
    `SELECT
       COUNT(*) FILTER (WHERE status = ANY($2::text[]))::int AS active_runs,
       COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL)::int AS with_sla,
       COUNT(*) FILTER (WHERE sla_due_at < now() AND status <> ALL($3::text[]))::int AS breached
     FROM public.erp_orders WHERE tenant_id = $1`,
    [tenant, ACTIVE_RUN, TERMINAL_OK],
  );
  const withSla = num(slaRow.with_sla);
  const breached = num(slaRow.breached);
  const slaAdherencePct = withSla > 0 ? Math.round(((withSla - breached) / withSla) * 1000) / 10 : null;

  // ── Vitals: POD pipelines (suppliers with a harvested catalog) ─────
  const podRows = await q(
    `SELECT s.name FROM public.suppliers s
      WHERE EXISTS (SELECT 1 FROM public.supplier_catalog_products p WHERE p.supplier_id = s.id)
      ORDER BY s.name`,
    [],
  );
  const podNames = podRows.map((r) => String(r.name));
  const ELEVATED = ["Printful", "Printify", "Cloudprinter"];
  const elevatedPresent = ELEVATED.filter((n) => podNames.includes(n));

  // ── Vitals + funnel: invoices ───────────────────────────────────────
  const invRow = await one(
    `SELECT
       COALESCE(SUM(total - amount_paid - amount_credited) FILTER (
         WHERE due_date < CURRENT_DATE AND status NOT IN ('paid','void','voided','cancelled','draft')
           AND (total - amount_paid - amount_credited) > 0), 0)::float AS overdue_amount,
       COUNT(*) FILTER (
         WHERE due_date < CURRENT_DATE AND status NOT IN ('paid','void','voided','cancelled','draft')
           AND (total - amount_paid - amount_credited) > 0)::int AS overdue_count,
       COALESCE(SUM(total - amount_paid - amount_credited) FILTER (
         WHERE status NOT IN ('paid','void','voided','cancelled','draft')
           AND (total - amount_paid - amount_credited) > 0), 0)::float AS unpaid_amount,
       COUNT(*) FILTER (
         WHERE status NOT IN ('paid','void','voided','cancelled','draft')
           AND (total - amount_paid - amount_credited) > 0)::int AS unpaid_count,
       COALESCE(SUM(total) FILTER (WHERE status = 'paid' AND paid_at >= now() - interval '30 days'), 0)::float AS paid30_amount,
       COUNT(*) FILTER (WHERE status = 'paid' AND paid_at >= now() - interval '30 days')::int AS paid30_count
     FROM public.acct_ar_invoices WHERE tenant_id = $1`,
  );
  const payoutRow = await one(
    `SELECT COALESCE(SUM(net_amount) FILTER (WHERE status IN ('paid','arrived','completed','succeeded')), 0)::float AS deposited,
            COUNT(*) FILTER (WHERE status IN ('paid','arrived','completed','succeeded'))::int AS deposited_count
       FROM public.acct_payouts WHERE tenant_id = $1`,
  );

  // ── Attention items (shared by Vitals urgent list + Attention Queue) ──
  type Item = {
    id: string; kind: "sla" | "stock" | "ticket" | "task" | "verification";
    severity: "critical" | "warning" | "info";
    title: string; detail: string; meta: string; at: string | null;
    actionLabel: string; href: string;
  };
  const items: Item[] = [];

  const slaOrders = await q(
    `SELECT id::text AS id, order_number, customer_email, sla_due_at,
            EXTRACT(EPOCH FROM (now() - sla_due_at)) / 3600 AS overdue_hours
       FROM public.erp_orders
      WHERE tenant_id = $1 AND sla_due_at < now() AND status <> ALL($2::text[])
      ORDER BY sla_due_at ASC LIMIT 25`,
    [tenant, TERMINAL_OK],
  );
  for (const o of slaOrders) {
    const hrs = Math.max(1, Math.round(num(o.overdue_hours)));
    items.push({
      id: `sla-${o.id}`, kind: "sla", severity: "critical",
      title: `Fulfillment SLA Breach: Order #${o.order_number ?? String(o.id).slice(0, 8)}`,
      detail: `The fulfillment provider has not completed this order within its SLA window.${o.customer_email ? ` Customer: ${o.customer_email}` : ""}`,
      meta: `Overdue (${hrs}h)`, at: o.sla_due_at ? new Date(o.sla_due_at).toISOString() : null,
      actionLabel: "Reroute Supplier", href: `/admin/orders/${o.id}`,
    });
  }

  const stockAlerts = await q(
    `SELECT id::text AS id, alert_type, severity, current_quantity, threshold_quantity, created_at
       FROM public.commerce_inventory_alerts
      WHERE tenant_id = $1 AND status NOT IN ('resolved','dismissed')
      ORDER BY created_at DESC LIMIT 25`,
  );
  for (const a of stockAlerts) {
    items.push({
      id: `stock-${a.id}`, kind: "stock",
      severity: a.severity === "critical" || a.severity === "high" ? "critical" : "warning",
      title: `Low Stock Alert: ${a.alert_type ?? "inventory"}`,
      detail: `Current quantity ${num(a.current_quantity)} at or below the threshold of ${num(a.threshold_quantity)}. Re-order recommended.`,
      meta: `Stock: ${num(a.current_quantity)} remaining`, at: a.created_at ? new Date(a.created_at).toISOString() : null,
      actionLabel: "Create PO", href: "/admin/accounting/inventory/stock",
    });
  }

  const notifRows = await q(
    `SELECT id::text AS id, kind, ref, created_at FROM public.support_notifications
      WHERE tenant_id = $1 AND read_at IS NULL ORDER BY created_at DESC LIMIT 25`,
  );
  for (const n of notifRows) {
    items.push({
      id: `ticket-${n.id}`, kind: "ticket", severity: "warning",
      title: `Support Queue: ${n.kind ?? "notification"}${n.ref ? ` — ${n.ref}` : ""}`,
      detail: n.ref ? `Ticket ${n.ref} needs operator attention in the support queue.` : "A support queue event needs operator attention.",
      meta: "", at: n.created_at ? new Date(n.created_at).toISOString() : null,
      actionLabel: "Assign & View", href: "/admin/support",
    });
  }

  const taskRows = await q(
    `SELECT id::text AS id, title, description, task_type, priority, due_at, customer_id::text AS customer_id, created_at
       FROM public.crm_tasks
      WHERE tenant_id = $1 AND status = 'open' AND priority IN ('high','urgent')
      ORDER BY due_at ASC NULLS LAST, created_at DESC LIMIT 25`,
  );
  for (const t of taskRows) {
    items.push({
      id: `task-${t.id}`, kind: "task", severity: t.priority === "urgent" ? "critical" : "warning",
      title: String(t.title ?? "Operational task"),
      detail: String(t.description ?? `Task type: ${t.task_type ?? "general"}`),
      meta: t.due_at ? `Due ${new Date(t.due_at).toLocaleDateString("en-US")}` : "",
      at: t.created_at ? new Date(t.created_at).toISOString() : null,
      actionLabel: "View Task", href: t.customer_id ? `/admin/customers/${t.customer_id}` : "/admin/customers",
    });
  }

  const verifyRows = await q(
    `SELECT v.id::text AS id, v.task_type, v.status, v.created_at,
            COALESCE(s.display_name, s.legal_name, 'Seller') AS seller_name
       FROM public.verification_tasks v
       LEFT JOIN public.sellers s ON s.id = v.seller_id
      WHERE v.tenant_id = $1 AND v.status = ANY($2::text[])
      ORDER BY v.created_at DESC LIMIT 25`,
    [tenant, VERIFY_PENDING],
  );
  const verificationItems: Item[] = verifyRows.map((v) => ({
    id: `verify-${v.id}`, kind: "verification" as const, severity: "info" as const,
    title: `${v.task_type === "tax" || String(v.task_type).includes("1099") ? "W-9 / Tax" : "Seller"} Verification Needed: ${v.seller_name}`,
    detail: `${v.seller_name} submitted a ${v.task_type ?? "verification"} profile awaiting review.`,
    meta: `Status: ${v.status}`, at: v.created_at ? new Date(v.created_at).toISOString() : null,
    actionLabel: "Review Form", href: "/admin/sellers/verification",
  }));

  // ── Counts (exact, uncapped — the siderail + tabs read these) ──────
  const countRow = await one(
    `SELECT
       (SELECT COUNT(*)::int FROM public.erp_orders WHERE tenant_id = $1 AND sla_due_at < now() AND status <> ALL($2::text[]))
       + (SELECT COUNT(*)::int FROM public.commerce_inventory_alerts WHERE tenant_id = $1 AND status NOT IN ('resolved','dismissed'))
       + (SELECT COUNT(*)::int FROM public.support_notifications WHERE tenant_id = $1 AND read_at IS NULL)
       + (SELECT COUNT(*)::int FROM public.crm_tasks WHERE tenant_id = $1 AND status = 'open' AND priority IN ('high','urgent')) AS attention,
       (SELECT COUNT(*)::int FROM public.customer_notifications WHERE tenant_id = $1 AND "readAt" IS NULL) AS customers,
       (SELECT COUNT(*)::int FROM public.seller_performance_alerts WHERE tenant_id = $1 AND status = 'open')
       + (SELECT COUNT(*)::int FROM public.verification_tasks WHERE tenant_id = $1 AND status = ANY($3::text[])) AS sellers`,
    [tenant, TERMINAL_OK, VERIFY_PENDING],
  );

  // ── Executive ───────────────────────────────────────────────────────
  const execRow = await one(
    `SELECT
       COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled' AND order_date >= date_trunc('year', now())), 0)::float AS ytd_revenue,
       COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled' AND order_date >= date_trunc('year', now()) - interval '1 year' AND order_date < date_trunc('year', now())), 0)::float AS prior_ytd_revenue
     FROM public.erp_orders WHERE tenant_id = $1`,
  );
  const ytdRevenue = num(execRow.ytd_revenue);
  const priorYtd = num(execRow.prior_ytd_revenue);
  const ytdDeltaPct = priorYtd > 0 ? Math.round(((ytdRevenue - priorYtd) / priorYtd) * 1000) / 10 : null;

  // ── Settlements (Analytics view table) ─────────────────────────────
  const settlementRows = await q(
    `SELECT id::text AS id, payout_number, provider, destination_type, destination_last4,
            net_amount, status, scheduled_for, arrived_at, created_at
       FROM public.acct_payouts WHERE tenant_id = $1
      ORDER BY COALESCE(arrived_at, created_at) DESC LIMIT 8`,
  );
  const settlements = settlementRows.map((p) => ({
    id: p.id,
    date: (p.arrived_at ?? p.scheduled_for ?? p.created_at) ? new Date(p.arrived_at ?? p.scheduled_for ?? p.created_at).toISOString() : null,
    batch: p.payout_number ?? `${p.provider ?? "Payout"} payout`,
    channel: [p.provider, p.destination_type ? `${p.destination_type}${p.destination_last4 ? ` ··${p.destination_last4}` : ""}` : null].filter(Boolean).join(" — "),
    net: num(p.net_amount),
    status: p.status ?? "",
  }));

  // ── Customer queue ──────────────────────────────────────────────────
  const custRows = await q(
    `SELECT id, type, title, body, "createdAt" AS created_at, "readAt" AS read_at
       FROM public.customer_notifications WHERE tenant_id = $1
      ORDER BY "createdAt" DESC LIMIT 20`,
  );
  const customerItems = custRows.map((c) => ({
    id: String(c.id), type: c.type ?? "notification",
    title: String(c.title ?? "(untitled)"), body: String(c.body ?? ""),
    at: c.created_at ? new Date(c.created_at).toISOString() : null,
    read: c.read_at != null,
  }));

  // ── Seller queue ────────────────────────────────────────────────────
  const perfRows = await q(
    `SELECT a.id::text AS id, a.kpi_key, a.metric_value, a.threshold, a.status, a.created_at,
            COALESCE(s.display_name, s.legal_name, 'Seller') AS seller_name
       FROM public.seller_performance_alerts a
       LEFT JOIN public.sellers s ON s.id = a.seller_id
      WHERE a.tenant_id = $1 AND a.status = 'open'
      ORDER BY a.created_at DESC LIMIT 25`,
  );
  const sellerItems = [
    ...perfRows.map((a) => ({
      id: `perf-${a.id}`, kind: "performance" as const,
      title: `${a.seller_name} — ${a.kpi_key ?? "performance"} alert`,
      detail: `Metric ${num(a.metric_value)} against a threshold of ${num(a.threshold)}.`,
      at: a.created_at ? new Date(a.created_at).toISOString() : null,
      actionLabel: "Acknowledge", actionApiId: String(a.id).replace(/^perf-/, ""),
      href: "/admin/analytics",
    })),
    ...verificationItems.map((v) => ({
      id: v.id, kind: "verification" as const,
      title: v.title, detail: v.detail, at: v.at,
      actionLabel: "Verify Seller", actionApiId: null as string | null,
      href: "/admin/sellers/verification",
    })),
  ];

  const severityRank = { critical: 0, warning: 1, info: 2 } as const;
  const attentionItems = [...items].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  const urgentTasks = [...items.filter((i) => i.kind !== "ticket"), ...verificationItems]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 10);
  const criticalCount = urgentTasks.filter((i) => i.severity === "critical").length;

  return {
    counts: {
      attention: num(countRow.attention),
      customers: num(countRow.customers),
      sellers: num(countRow.sellers),
    },
    vitals: {
      gmv: { total: gmvTotal, last30: gmvLast30, deltaPct: gmvDeltaPct },
      printRuns: { active: num(slaRow.active_runs), slaAdherencePct, breached },
      podPipelines: { connected: podNames.length, names: podNames, elevated: elevatedPresent },
      overdue: { amount: num(invRow.overdue_amount), count: num(invRow.overdue_count) },
      funnel: {
        unpaid: { amount: num(invRow.unpaid_amount), count: num(invRow.unpaid_count) },
        paidCycle: { amount: num(invRow.paid30_amount), count: num(invRow.paid30_count) },
        deposited: { amount: num(payoutRow.deposited), count: num(payoutRow.deposited_count) },
      },
      urgentTasks,
      criticalCount,
    },
    executive: {
      ytdRevenue,
      ytdDeltaPct,
      // Margin is not computable from the live schema: the order ledger
      // (erp_orders) has no line items and supplier_catalog_variants
      // carries no cost column — see dashboard-view-gaps-2026-11-02.md.
      margin: { computable: false },
    },
    settlements,
    attention: { items: attentionItems },
    customers: { unread: num(countRow.customers), items: customerItems },
    sellers: { items: sellerItems },
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const out = await withPg(async (client) => {
    const tenant = await resolveActiveTenantId(client, req);
    return buildViews(client, tenant);
  });
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  return NextResponse.json({ data: out });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "mark-all-resolved") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const out = await withPg(async (client) => {
    const tenant = await resolveActiveTenantId(client, req);
    const n1 = await client.query(
      `UPDATE public.support_notifications SET read_at = now(), updated_at = now()
        WHERE tenant_id = $1 AND read_at IS NULL`,
      [tenant],
    );
    const n2 = await client.query(
      `UPDATE public.commerce_inventory_alerts SET status = 'resolved', resolved_at = now()
        WHERE tenant_id = $1 AND status NOT IN ('resolved','dismissed')`,
      [tenant],
    );
    return { notificationsRead: n1.rowCount ?? 0, inventoryAlertsResolved: n2.rowCount ?? 0 };
  });
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  return NextResponse.json({ data: out });
}
