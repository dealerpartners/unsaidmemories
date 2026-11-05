import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg"
import type { SellerQueryFn } from "@/lib/sellers/attribution"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// POST /api/admin/packages/[id]/label — admin parity for the seller
// package label purchase (contract step 9). Same engine, same rules
// (lib/fulfillment/label): ready_for_label buys once, repeats return
// the stored label, unknown outcomes reconcile before any new spend.
// Credentials follow the PACKAGE's seller through the one gate — an
// admin buying for an unconnected seller gets the same honest 422 a
// seller gets, never a silent house-key label.
// ============================================================================

const q: SellerQueryFn = async (sql, params) =>
  (await pgQuery(sql, params as any[])) as Record<string, unknown>[]

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("orders", "write")
  if (gate) return gate
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing package id" }, { status: 400 })
    const tenant = resolveTenantId(req)

    const { purchaseLabelForPackage, ShippoSellerNotConnectedError } = await import(
      "@/lib/fulfillment/label"
    )
    let result: Awaited<ReturnType<typeof purchaseLabelForPackage>>
    try {
      result = await purchaseLabelForPackage(q, {
        tenantId: tenant,
        packageId: id,
        actor: { kind: "admin" },
      })
    } catch (e: any) {
      if (e instanceof ShippoSellerNotConnectedError || e?.message === "shippo_seller_not_connected") {
        return NextResponse.json(
          {
            error: "shippo_seller_not_connected",
            message:
              "This package's seller has not connected their Shippo account — their labels bill to their own account, so the platform cannot buy this label for them yet.",
          },
          { status: 422 },
        )
      }
      if (e?.message === "shippo_not_configured") {
        return NextResponse.json(
          { error: "shippo_not_configured", message: "Shipping is not configured — set a Shippo API key in Admin → Settings → Shipping." },
          { status: 503 },
        )
      }
      throw e
    }

    if (!result.available) {
      return NextResponse.json(
        {
          error: "label_store_not_installed",
          message: "Package labels are not enabled yet (the fulfillment store is still being installed).",
        },
        { status: 503 },
      )
    }
    if (!result.found) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 })
    }
    const o = result.outcome
    if (o.ok) {
      return NextResponse.json({
        ok: true,
        packageId: id,
        outcome: o.outcome,
        state: o.state,
        label: {
          labelUrl: o.label.labelUrl,
          trackingNumber: o.label.trackingNumber,
          trackingUrl: o.label.trackingUrl,
          carrier: o.label.carrier,
          service: o.label.service,
          rateCents: o.label.rateCents,
          testMode: o.label.testMode,
        },
      })
    }
    const status =
      o.reason === "wrong_state" || o.reason === "pickup_package"
        ? 409
        : o.reason === "unknown_outcome" || o.reason === "provider_failed"
          ? 502
          : 422
    return NextResponse.json(
      { error: o.reason, message: o.message, retryable: !!o.retryable },
      { status },
    )
  } catch (e: any) {
    console.error("[admin/packages/label] purchase failed:", e?.message || e)
    return NextResponse.json({ error: "label_purchase_failed", message: e?.message || "Label purchase failed" }, { status: 502 })
  }
}
