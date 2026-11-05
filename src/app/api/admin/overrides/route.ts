import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { writeSellerAudit, requestIp as sellerRequestIp } from "@/lib/sellers/audit"
import { notifySeller } from "@/lib/sellers/notify"
import { resolveAdminActor, requestIp } from "@/lib/admin/actor"
import {
  OVERRIDE_TYPES,
  SELLER_STATUS_VOCAB,
  OverrideError,
  applyOverride,
  type OverrideType,
} from "@/lib/admin/manual-overrides"

// ---------------------------------------------------------------------------
// /api/admin/overrides — K2 · Manual Overrides. Tree leaves: Override
// price · Override commission · Override KPI · Override status · Override
// hold.
//
// Every act runs through src/lib/admin/manual-overrides.ts: the override
// record (before/after + REQUIRED reason + actor) and the governed
// mechanism land in ONE transaction — an override is a governed act on a
// real record (the listing's price, the seller's commission_rate, a KPI
// fact §I serves, the actor's own status field, an E1 payout transition),
// never a shadow write. Audits: crm_audit_log for every act, plus
// seller_audit_log whenever a seller is the subject.
//
// GATE: requireModuleApi("administration", …) — the K tools' module.
// ---------------------------------------------------------------------------

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate
  const tenant = resolveTenantId(req)

  try {
    const payload = await withPg(async (client) => {
      const overrides = await client.query(
        `SELECT id::text AS id, override_type, target_type, target_id, target_label,
                field, before_value, after_value, reason, actor_email, applied_at
           FROM public.admin_manual_overrides
          WHERE tenant_id = $1::uuid
          ORDER BY applied_at DESC LIMIT 50`,
        [tenant],
      )
      const sellers = await client.query(
        `SELECT id::text AS id, display_name, status, commission_rate::float AS commission_rate
           FROM public.sellers WHERE tenant_id = $1::uuid ORDER BY display_name`,
        [tenant],
      )
      const metricDefs = await client.query(
        `SELECT key FROM public.seller_metric_definitions WHERE tenant_id = $1::uuid
         UNION
         SELECT key FROM public.seller_kpi_definitions WHERE tenant_id = $1::uuid
         ORDER BY key`,
        [tenant],
      )
      const payouts = await client.query(
        `SELECT p.id::text AS id, p.status, p.amount::float AS amount,
                s.display_name AS seller_name
           FROM public.seller_payouts p
           JOIN public.sellers s ON s.id = p.seller_id AND s.tenant_id = p.tenant_id
          WHERE p.tenant_id = $1::uuid
          ORDER BY p.created_at DESC LIMIT 50`,
        [tenant],
      )
      const listings = await client.query(
        `SELECT l.id::text AS id, l.title, l.price::float AS price,
                s.display_name AS seller_name
           FROM public.seller_listings l
           JOIN public.sellers s ON s.id = l.seller_id AND s.tenant_id = l.tenant_id
          WHERE l.tenant_id = $1::uuid
          ORDER BY l.created_at DESC LIMIT 50`,
        [tenant],
      )
      return {
        tenantId: tenant,
        overrides: overrides.rows.map((r: any) => ({
          id: String(r.id),
          type: r.override_type,
          targetType: r.target_type,
          targetId: String(r.target_id),
          targetLabel: r.target_label,
          field: r.field,
          before: r.before_value,
          after: r.after_value,
          reason: r.reason,
          actorEmail: r.actor_email,
          appliedAt: new Date(r.applied_at).toISOString(),
        })),
        sellers: sellers.rows.map((r: any) => ({
          id: String(r.id),
          name: r.display_name,
          status: r.status,
          commissionRate: r.commission_rate,
        })),
        metricKeys: metricDefs.rows.map((r: any) => String(r.key)),
        payouts: payouts.rows.map((r: any) => ({
          id: String(r.id),
          status: r.status,
          amount: r.amount,
          sellerName: r.seller_name,
        })),
        listings: listings.rows.map((r: any) => ({
          id: String(r.id),
          title: r.title,
          price: r.price,
          sellerName: r.seller_name,
        })),
        vocabularies: {
          overrideTypes: [...OVERRIDE_TYPES],
          sellerStatus: [...SELLER_STATUS_VOCAB],
          holdActions: ["hold", "release"],
          statusTargets: ["seller", "customer", "employee"],
        },
      }
    })
    if (!payload) {
      return NextResponse.json({ error: "Database unavailable — overrides could not be read." }, { status: 503 })
    }
    return NextResponse.json(payload)
  } catch (e: any) {
    console.error("[GET /api/admin/overrides]", e)
    return NextResponse.json({ error: `Load failed: ${e.message}` }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write")
  if (gate) return gate
  const tenant = resolveTenantId(req)

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const overrideType = String(body.overrideType || "") as OverrideType
  if (!(OVERRIDE_TYPES as readonly string[]).includes(overrideType)) {
    return NextResponse.json(
      { error: `overrideType must be one of ${OVERRIDE_TYPES.join(", ")}` },
      { status: 400 },
    )
  }
  const targetType = String(body.targetType || "").trim()
  const targetId = String(body.targetId || "").trim()
  if (!targetType || !targetId) {
    return NextResponse.json({ error: "targetType and targetId are required" }, { status: 400 })
  }
  const reason = String(body.reason || "").trim()
  if (!reason) {
    return NextResponse.json(
      { error: "A reason is required — an override without a recorded reason is refused by design." },
      { status: 400 },
    )
  }
  if (reason.length > 1000) {
    return NextResponse.json({ error: "Reason is limited to 1000 characters." }, { status: 400 })
  }

  try {
    const out = await withPg(async (client) => {
      const actor = await resolveAdminActor(client, tenant)
      const result = await applyOverride(client, {
        tenantId: tenant,
        overrideType,
        targetType,
        targetId,
        newValue: body.newValue,
        metricKey: body.metricKey ?? null,
        reason,
        actorId: actor.userId,
        actorEmail: actor.email,
        ip: requestIp(req),
        revertsOverrideId: body.revertsOverrideId ?? null,
        platformTenantId: TENANT_ID(),
      })
      return { ...result, actor }
    })
    if (!out) {
      return NextResponse.json({ error: "Database unavailable — nothing was written." }, { status: 503 })
    }

    const actorId = await getActorIdFromRequest(req)
    await auditAction({
      action: `k2_override_${overrideType}`,
      domain: "crm",
      tableName: "admin_manual_overrides",
      recordId: out.overrideId,
      beforeData: out.before ?? undefined,
      afterData: {
        tenant_id: tenant,
        target_type: targetType,
        target_id: targetId,
        target_label: out.targetLabel,
        field: out.field,
        after: out.after,
        reason,
      },
      actorUserId: actorId,
      ipAddress: requestIp(req),
    })
    if (out.sellerId) {
      await writeSellerAudit(null, {
        tenantId: tenant,
        sellerId: out.sellerId,
        actorId: actorId,
        action: `override.${overrideType}`,
        entityType: "manual_override",
        entityId: out.overrideId,
        beforeState: out.before ?? {},
        afterState: { field: out.field, after: out.after, reason },
        ipAddress: sellerRequestIp(req),
      })
    }
    // A payout hold/release override is a payout status change — the
    // seller hears it through the comms layer (event "payments"),
    // after the override transaction has committed. notifySeller is
    // failure-isolated; the override stands either way.
    if (out.sellerId && out.field === "payout_status") {
      const toStatus = String(out.after?.status || "")
      const held = toStatus === "on_hold"
      await notifySeller({
        tenantId: tenant,
        sellerId: out.sellerId,
        event: "payments",
        type: "payout_status",
        title: held ? "Payout placed on hold" : "Payout hold released",
        body: held
          ? `A payout has been placed on hold by platform review: ${reason}. It will not be disbursed while the hold stands.`
          : `The hold on a payout has been released by platform review: ${reason}. It is back in the review queue.`,
        link: "/seller/payments/overview",
      })
    }

    return NextResponse.json({
      ok: true,
      overrideId: out.overrideId,
      field: out.field,
      before: out.before,
      after: out.after,
      targetLabel: out.targetLabel,
    })
  } catch (e: any) {
    if (e instanceof OverrideError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[POST /api/admin/overrides]", e)
    return NextResponse.json({ error: `Override failed: ${e.message}` }, { status: 500 })
  }
}
