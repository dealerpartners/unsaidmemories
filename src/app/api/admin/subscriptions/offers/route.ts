import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  sessionFromPayload,
} from "@/lib/portal-auth"
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveTenantId } from "@/lib/admin-api"
import { withPg } from "@/lib/crm/enterprise"
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit"
import {
  listOffersForAdmin,
  createOffer,
  updateOffer,
  getOffer,
  validateOfferInput,
  type OfferInput,
} from "@/lib/subscriptions/platform-subscriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/subscriptions/offers — the admin offers seat for My
// Subscriptions (Sunny, 2026-10-14): "any subscription I put on the
// platform" is authored HERE. Offers are per-tenant records; the seat
// invents nothing — every name, price, and cadence is entered by the
// admin. Gated by the 'subscriptions' module code (assignable per-user
// like every admin module); every act is audited.
// ============================================================================

async function actorEmail(): Promise<string | null> {
  const cookieStore = await cookies()
  const payload = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!payload) return null
  const user = sessionFromPayload(payload) as any
  return user?.email ?? null
}

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("subscriptions", "read")
  if (denied) return denied
  const tenantId = resolveTenantId(req)
  const offers = await withPg((c) => listOffersForAdmin(c, tenantId))
  if (!offers) {
    return NextResponse.json(
      { error: "Subscription offers are unavailable right now." },
      { status: 500 },
    )
  }
  return NextResponse.json({ offers })
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("subscriptions", "write")
  if (denied) return denied
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  const input: OfferInput = {
    name: body.name,
    category: body.category,
    description: body.description ?? null,
    priceCents: body.priceCents,
    cadence: body.cadence,
    applicableUserTypes: body.applicableUserTypes ?? [],
    stripeProductId: body.stripeProductId ?? null,
    stripePriceId: body.stripePriceId ?? null,
  }
  const invalid =
    validateOfferInput(input) ||
    (typeof input.name !== "string" ? "name_required" : null) ||
    (typeof input.priceCents !== "number" ? "bad_price" : null) ||
    (!Array.isArray(input.applicableUserTypes) ? "user_types_required" : null)
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 })
  }
  const tenantId = resolveTenantId(req)
  const email = await actorEmail()
  const offer = await withPg((c) =>
    createOffer(c, { tenantId, actorEmail: email, ...input }),
  )
  if (!offer) {
    return NextResponse.json(
      { error: "Could not create the offer." },
      { status: 500 },
    )
  }
  await auditAction({
    action: "subscription_offer.created",
    domain: "commerce",
    tableName: "platform_subscription_offers",
    recordId: offer.id,
    actorUserId: await getActorIdFromRequest(req),
    afterData: {
      name: offer.name,
      category: offer.category,
      priceCents: offer.priceCents,
      cadence: offer.cadence,
      applicableUserTypes: offer.applicableUserTypes,
      isActive: offer.isActive,
    },
  })
  return NextResponse.json({ offer })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("subscriptions", "write")
  if (denied) return denied
  const body = await req.json().catch(() => null)
  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }
  const patch: Partial<OfferInput> & { isActive?: boolean } = {}
  for (const k of [
    "name",
    "category",
    "description",
    "priceCents",
    "cadence",
    "applicableUserTypes",
    "stripeProductId",
    "stripePriceId",
    "isActive",
  ] as const) {
    if (body[k] !== undefined) (patch as any)[k] = body[k]
  }
  const invalid = validateOfferInput(patch)
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 })
  }
  const tenantId = resolveTenantId(req)
  const email = await actorEmail()
  const before = await withPg((c) => getOffer(c, tenantId, body.id))
  if (!before) {
    return NextResponse.json({ error: "offer_not_found" }, { status: 404 })
  }
  const offer = await withPg((c) =>
    updateOffer(c, { tenantId, offerId: body.id, actorEmail: email, patch }),
  )
  if (!offer) {
    return NextResponse.json({ error: "offer_not_found" }, { status: 404 })
  }
  const flipped =
    patch.isActive !== undefined && patch.isActive !== before.isActive
  await auditAction({
    action: flipped
      ? patch.isActive
        ? "subscription_offer.activated"
        : "subscription_offer.deactivated"
      : "subscription_offer.updated",
    domain: "commerce",
    tableName: "platform_subscription_offers",
    recordId: offer.id,
    actorUserId: await getActorIdFromRequest(req),
    beforeData: {
      name: before.name,
      priceCents: before.priceCents,
      cadence: before.cadence,
      isActive: before.isActive,
    },
    afterData: {
      name: offer.name,
      category: offer.category,
      priceCents: offer.priceCents,
      cadence: offer.cadence,
      applicableUserTypes: offer.applicableUserTypes,
      isActive: offer.isActive,
    },
  })
  return NextResponse.json({ offer })
}
