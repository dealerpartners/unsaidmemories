import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// C3 · Dispute evidence — the submission path the census found missing
// (/api/admin/disputes read + /sync pulled from Stripe; nothing ever
// submitted evidence TO Stripe).
//
// POST { dispute_id, evidence?: {...}, submit?: boolean }
//   1. Loads the local dispute (commerce_disputes). Only open /
//      under_review disputes can receive evidence, and only disputes
//      carrying a processor_dispute_id (Stripe-synced) can be submitted
//      — a local-only dispute gets an honest 400, never a fake success.
//   2. Assembles the evidence base from REAL records: the linked
//      commerce_payments row (amount, tender, processor reference), its
//      CRM customer (name/email when the payment carries a customer),
//      and the dispute's own recorded notes. Caller-supplied evidence
//      fields are layered over that base — only non-empty strings are
//      sent, and only Stripe's documented text evidence fields.
//   3. Stripe disputes.update(id, { evidence }) then, unless
//      submit === false, disputes.update(id, { submit: true }) — the
//      SDK's two-call evidence flow. The submission is then recorded on
//      the local row: status 'under_review', responded_at,
//      evidence_submitted_at / _by / evidence_payload (the exact payload
//      sent) / evidence_stripe_status (migration 20261083).
// Stripe not configured follows the codebase's honest pattern (the sync
// route's 503): the full code path exists and refuses plainly.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Stripe dispute evidence text fields (Dispute Evidence object) this desk
// will send. File fields are deliberately absent — no upload is faked.
const EVIDENCE_FIELDS = [
  "access_activity_log",
  "billing_address",
  "cancellation_policy_disclosure",
  "cancellation_rebuttal",
  "customer_email_address",
  "customer_name",
  "customer_purchase_ip",
  "duplicate_charge_explanation",
  "product_description",
  "receipt",
  "refund_policy_disclosure",
  "refund_refusal_explanation",
  "service_date",
  "service_documentation",
  "shipping_address",
  "shipping_date",
  "shipping_documentation",
  "shipping_tracking_number",
  "uncategorized_text",
] as const

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("refunds_disputes", "write")
  if (gate) return gate

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json(
      { error: "Stripe is not configured (STRIPE_SECRET_KEY missing) — cannot submit dispute evidence" },
      { status: 503 },
    )
  }

  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const actorId = await getActorIdFromRequest(req)
  const disputeId = typeof b.dispute_id === "string" ? b.dispute_id.trim() : ""
  if (!disputeId || !UUID_RE.test(disputeId)) {
    return NextResponse.json({ error: "Missing dispute id" }, { status: 400 })
  }
  const submit = b.submit !== false
  const supplied: Record<string, string> = {}
  if (b.evidence && typeof b.evidence === "object") {
    for (const f of EVIDENCE_FIELDS) {
      const v = (b.evidence as Record<string, unknown>)[f]
      if (typeof v === "string" && v.trim()) supplied[f] = v.trim().slice(0, 20000)
    }
  }
  if (typeof b.uncategorized_text === "string" && b.uncategorized_text.trim()) {
    supplied.uncategorized_text = b.uncategorized_text.trim().slice(0, 20000)
  }

  // Load + assemble from real records first (no Stripe call is made for a
  // dispute that cannot receive evidence).
  const loaded = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT d.id::text AS id, d.dispute_number, d.reason, d.status,
              d.amount::float AS amount, d.notes, d.processor_dispute_id,
              d.payment_id::text AS payment_id,
              p.payment_number, p.amount::float AS payment_amount,
              p.processor_transaction_id, p.external_reference,
              p.created_at::text AS payment_created_at,
              pm.name AS tender_name,
              cc.first_name AS customer_first_name, cc.last_name AS customer_last_name,
              cc.email AS customer_email
         FROM public.commerce_disputes d
         LEFT JOIN public.commerce_payments p ON p.id = d.payment_id AND p.tenant_id = d.tenant_id
         LEFT JOIN public.commerce_payment_methods pm ON pm.id = p.payment_method_id
         LEFT JOIN public.crm_customers cc ON cc.id = p.customer_id
        WHERE d.tenant_id = $1 AND d.id = $2::uuid LIMIT 1`,
      [tenant, disputeId],
    )
    return rows[0] ?? null
  })
  if (!loaded) {
    return NextResponse.json({ error: "Dispute not found (or database unavailable)" }, { status: 404 })
  }
  if (!["open", "under_review"].includes(String(loaded.status))) {
    return NextResponse.json(
      { error: `Dispute is '${loaded.status}' — closed disputes cannot receive evidence` },
      { status: 400 },
    )
  }
  if (!loaded.processor_dispute_id) {
    return NextResponse.json(
      {
        error:
          "This dispute has no Stripe dispute id (processor_dispute_id) — it is a local record only. Sync disputes from Stripe first; evidence can only be submitted for Stripe disputes.",
      },
      { status: 400 },
    )
  }

  const customerName =
    [loaded.customer_first_name, loaded.customer_last_name].filter(Boolean).join(" ").trim() || null
  const assembled: Record<string, string> = {}
  if (customerName) assembled.customer_name = customerName
  if (loaded.customer_email) assembled.customer_email_address = String(loaded.customer_email)
  assembled.product_description = [
    `Dispute ${loaded.dispute_number || loaded.id} — reason recorded: ${loaded.reason || "unspecified"}.`,
    loaded.payment_number ? `Payment ${loaded.payment_number}` : null,
    loaded.tender_name ? `paid by ${loaded.tender_name}` : null,
    loaded.payment_amount != null ? `payment amount $${Number(loaded.payment_amount).toFixed(2)}` : null,
    loaded.payment_created_at ? `payment recorded ${String(loaded.payment_created_at).slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(" ")
  if (loaded.notes) {
    assembled.uncategorized_text = String(loaded.notes)
  }
  const evidence: Record<string, string> = { ...assembled, ...supplied }
  if (Object.keys(evidence).length === 0) {
    return NextResponse.json(
      { error: "No evidence to submit — the dispute and its payment carry no assemblable evidence and none was supplied." },
      { status: 400 },
    )
  }

  try {
    const Stripe = (await import("stripe")).default
    const stripe = new Stripe(stripeKey)
    const processorId = String(loaded.processor_dispute_id)
    const updated = await stripe.disputes.update(processorId, {
      evidence: evidence as Record<string, string>,
    })
    let submitted = updated
    if (submit) {
      submitted = await stripe.disputes.update(processorId, { submit: true })
    }

    const recorded = await withPg(async (c) => {
      const { rows } = await c.query(
        `UPDATE public.commerce_disputes
            SET status = 'under_review', responded_at = now(), updated_at = now(),
                evidence_submitted_at = now(), evidence_submitted_by = $3,
                evidence_payload = $4::jsonb, evidence_stripe_status = $5,
                notes = COALESCE(notes || E'\n', '') || $6
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING id::text AS id, status, evidence_submitted_at::text AS evidence_submitted_at`,
        [
          tenant,
          disputeId,
          actorId || "admin",
          JSON.stringify({ evidence, submit, submitted_at: new Date().toISOString() }),
          String(submitted.status || updated.status || ""),
          submit
            ? `Evidence submitted to Stripe by admin (${actorId || "admin"}).`
            : `Evidence saved to Stripe (not submitted) by admin (${actorId || "admin"}).`,
        ],
      )
      return rows[0] ?? null
    })

    return NextResponse.json({
      ok: true,
      dispute: recorded,
      stripe: {
        dispute_id: processorId,
        status: submitted.status,
        submitted: submit,
        evidence_fields: Object.keys(evidence),
      },
      recording_note: recorded
        ? "Submission recorded on commerce_disputes (evidence_submitted_at/by/payload, migration 20261083)."
        : "Stripe accepted the evidence but the local recording did not land — check commerce_disputes; the evidence_* columns come from migration 20261083.",
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Stripe dispute evidence submission failed" },
      { status: 502 },
    )
  }
}
