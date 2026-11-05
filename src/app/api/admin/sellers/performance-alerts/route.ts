import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit"
import { evaluateSellerPerformanceAlerts } from "@/lib/sellers/performance-alerts"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// A4 · Seller Performance alerts — the admin face of
// lib/sellers/performance-alerts.ts (the writer seller_performance_alerts
// never had).
// GET  — recorded alerts (seller_performance_alerts, joined to sellers),
//        latest first / open first, plus the MOST RECENT evaluation run's
//        recorded outcome (the seller_audit_log row the POST writes —
//        that record is where 'not computable — no attributed orders'
//        outcomes live, so a run with no alerts is never silent).
// POST { action: 'evaluate' } — runs the evaluation over real attributed
//        order data, writes seller_performance_alerts rows for threshold
//        breaches (thresholds from seller_kpi_definitions), and records
//        the full per-seller/per-KPI outcome set in seller_audit_log.
//        Also { action: 'acknowledge', alert_id } — stamps an alert
//        acknowledged (status 'acknowledged' + by/at).
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)

  const out = await withPg(async (c) => {
    const alerts = (
      await c.query(
        `SELECT a.id::text AS id, a.seller_id::text AS seller_id, a.kpi_key,
                a.metric_value::float AS metric_value, a.threshold::float AS threshold,
                a.status, a.detail, a.acknowledged_by,
                a.acknowledged_at::text AS acknowledged_at,
                a.created_at::text AS created_at,
                s.display_name AS seller_name, s.status AS seller_status
           FROM public.seller_performance_alerts a
           LEFT JOIN public.sellers s ON s.id = a.seller_id AND s.tenant_id = a.tenant_id
          WHERE a.tenant_id = $1
          ORDER BY CASE a.status WHEN 'open' THEN 0 ELSE 1 END, a.created_at DESC
          LIMIT 200`,
        [tenant],
      )
    ).rows
    const lastRun = (
      await c.query(
        `SELECT after_state, created_at::text AS created_at
           FROM public.seller_audit_log
          WHERE tenant_id = $1 AND action = 'seller_performance.evaluate'
          ORDER BY created_at DESC LIMIT 1`,
        [tenant],
      )
    ).rows[0] as { after_state: Record<string, unknown>; created_at: string } | undefined
    return {
      alerts,
      counts: {
        open: alerts.filter((a: any) => a.status === "open").length,
        total: alerts.length,
      },
      lastEvaluation: lastRun
        ? { at: lastRun.created_at, ...(lastRun.after_state || {}) }
        : null,
      note:
        alerts.length === 0
          ? "No performance alerts are recorded. Run an evaluation: it computes late-shipment and return rates from real attributed orders, writes an alert only when a KPI threshold configured in seller_kpi_definitions is breached, and records a per-seller outcome either way (including 'not computable — no attributed orders')."
          : null,
    }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const actorId = await getActorIdFromRequest(req)
  const ipAddress = requestIp(req)
  const action = typeof b.action === "string" ? b.action : ""

  if (action === "acknowledge") {
    const alertId = typeof b.alert_id === "string" ? b.alert_id.trim() : ""
    if (!alertId) return NextResponse.json({ error: "Missing alert id" }, { status: 400 })
    const result = await withPg(async (c) => {
      const { rows } = await c.query(
        `UPDATE public.seller_performance_alerts
            SET status = 'acknowledged', acknowledged_by = $3, acknowledged_at = now(), updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid AND status = 'open'
          RETURNING id::text AS id, seller_id::text AS seller_id, kpi_key, status`,
        [tenant, alertId, actorId || "admin"],
      )
      if (!rows[0]) return { error: "Alert not found or already acknowledged", status: 404 }
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId: rows[0].seller_id, actorId, ipAddress,
        action: "seller_performance_alert.acknowledge", entityType: "seller_performance_alert", entityId: alertId,
        afterState: { kpi_key: rows[0].kpi_key, status: "acknowledged" },
      })
      return { ok: true as const, alert: rows[0] }
    })
    if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  }

  if (action !== "evaluate") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }

  const result = await withPg(async (c) => {
    const { outcomes, alertsWritten } = await evaluateSellerPerformanceAlerts(c, tenant)
    await writeSellerAudit(c, {
      tenantId: tenant,
      actorId,
      ipAddress,
      action: "seller_performance.evaluate",
      entityType: "seller_performance_alert",
      entityId: null,
      afterState: {
        alerts_written: alertsWritten,
        outcomes: outcomes.map((o) => ({
          seller_id: o.sellerId,
          kpi: o.kpiKey,
          outcome: o.outcome,
          value: o.value,
          threshold: o.threshold,
          denominator: o.denominator,
          attribution_source: o.attributionSource,
          reason: o.reason,
        })),
      },
    })
    return { outcomes, alertsWritten }
  })
  if (!result) {
    return NextResponse.json(
      { error: "Evaluation failed — the database did not answer. If seller_performance_alerts is missing its A4 columns, apply migration 20261083." },
      { status: 503 },
    )
  }
  return NextResponse.json({ ok: true, ...result })
}
