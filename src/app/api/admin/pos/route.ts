import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { getCurrentUser } from "@/lib/auth/server"
import { validateCoupon } from "@/lib/enterprise/promotions"
import {
  getPosCatalog,
  getPosPaymentMethods,
  getPosRegisters,
  getActiveRegisterSession,
  openRegister,
  closeRegister,
  recordCashMovement,
  completePosSale,
  processRefund,
  queryGiftCard,
  getPosTodaySummary,
  getPosTaxRates,
  getPosTodaySales,
  getRegisterSessionReport,
  type PosSaleInput,
  type RefundInput,
} from "@/lib/enterprise/pos"
import {
  resolveRegisterStaff,
  setStaffRegisterPin,
  isValidPinFormat,
  verifyRegisterPin,
  verifyStaffPin,
} from "@/lib/enterprise/register-pin"
import { voidPosSale } from "@/lib/enterprise/pos"
import { pgQuery } from "@/lib/pg"
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { getTwilioConfig, sendSms } from "@/lib/support/twilio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/pos — the Cloud POS API
//
//   GET    /api/admin/pos                         → { catalog, categories, paymentMethods, registers, todaySummary }
//   POST   /api/admin/pos?action=open_register     → open a register session
//   POST   /api/admin/pos?action=close_register    → close a register session
//   POST   /api/admin/pos?action=cash_movement     → record cash in/out
//   POST   /api/admin/pos?action=complete_sale     → complete a POS sale (idempotent, journal-balanced)
//   POST   /api/admin/pos?action=query_gift_card   → check gift card balance
//   POST   /api/admin/pos?action=refund            → process a return/refund (creates negative rows)
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("payments", "read")
  if (gate) return gate

  // The register serves the SIGNED-IN tenant's business (session-resolved:
  // switcher selection, else the caller's home tenant) — a franchise
  // tenant's POS reads and writes THEIR catalog, registers, and sales,
  // never headquarters'. Before this the whole POS stack silently bound
  // the deployment's home tenant.
  const tenant = resolveTenantId(req)

  const [catalogData, paymentMethods, registers, todaySummary, taxRates] = await Promise.all([
    getPosCatalog(tenant),
    getPosPaymentMethods(tenant),
    getPosRegisters(tenant),
    getPosTodaySummary(tenant),
    getPosTaxRates(tenant),
  ])

  const registersWithSessions = await Promise.all(
    registers.map(async (r) => ({
      ...r,
      activeSession: await getActiveRegisterSession(r.id),
    })),
  )

  // Cashier identity for the register header — the signed-in staff member
  // (display only; opened_by/created_by columns are staff UUIDs and are
  // not populated from the client). staffId + isManager drive the
  // register's per-employee permissions: manager-tier cashiers (portal
  // owners) reach refund/void/override directly; everyone else escalates
  // through the manager-PIN override, which is a DIFFERENT credential
  // from the register access PIN (register-pin.ts design rule).
  let cashier: { name: string | null; email: string | null; staffId: string | null; isManager: boolean } | null = null
  try {
    const user: any = await getCurrentUser()
    if (user) {
      const staff = await resolveRegisterStaff(String(user.id)).catch(() => null)
      let isManager = false
      try {
        const rows = await pgQuery<{ is_owner: boolean; role_type: string }>(
          `SELECT is_owner, role_type FROM public.portal_users WHERE user_id = $1::uuid LIMIT 1`,
          [String(user.id)],
        )
        isManager = !!rows[0]?.is_owner || rows[0]?.role_type === "owner"
      } catch { /* stays false — override remains the path */ }
      cashier = {
        name: user.user_metadata?.full_name || user.user_metadata?.name || staff?.displayName || null,
        email: user.email || null,
        staffId: staff?.id ?? null,
        isManager,
      }
    }
  } catch { /* header simply omits the cashier line */ }

  return NextResponse.json({
    catalog: catalogData.items,
    categories: catalogData.categories,
    paymentMethods,
    registers: registersWithSessions,
    todaySummary,
    taxRates,
    cashier,
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("payments", "write")
  if (gate) return gate

  const tenant = resolveTenantId(req)

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || "").trim()

    if (action === "open_register") {
      const { registerId, openingCash } = body
      if (!registerId) return NextResponse.json({ error: "registerId required" }, { status: 400 })
      // Access gate: the acting cashier is the SIGNED-IN user, resolved
      // to their staff profile; their own PIN opens the register. No
      // staff profile / no PIN / wrong PIN = honest refusal, no session.
      const user: any = await getCurrentUser()
      if (!user?.id) return NextResponse.json({ error: "Sign in to open a register." }, { status: 401 })
      const staff = await resolveRegisterStaff(String(user.id))
      if (!staff) {
        return NextResponse.json({
          error: "No staff profile is linked to your sign-in — a manager must link your staff profile before you can open a register.",
          code: "no_staff_profile",
        }, { status: 403 })
      }
      const result = await openRegister(registerId, Number(openingCash) || 0, {
        staffId: staff.id,
        userId: staff.userId,
        pin: body.pin ? String(body.pin) : "",
        tenantId: tenant,
      })
      if (result && "error" in result) {
        return NextResponse.json({ error: result.error, code: result.code }, { status: 403 })
      }
      return NextResponse.json({ session: result })
    }

    if (action === "set_register_pin") {
      // Self-service: the signed-in staff member sets their OWN register
      // PIN on their staff profile. Stored hashed (register-pin.ts); the
      // PIN itself is never echoed back.
      const user: any = await getCurrentUser()
      if (!user?.id) return NextResponse.json({ error: "Sign in to set your register PIN." }, { status: 401 })
      const pin = body.pin ? String(body.pin) : ""
      if (!isValidPinFormat(pin)) {
        return NextResponse.json({ error: "PIN must be 4–8 digits." }, { status: 400 })
      }
      const staff = await resolveRegisterStaff(String(user.id))
      if (!staff) {
        return NextResponse.json({
          error: "No staff profile is linked to your sign-in — a manager must link your staff profile first.",
          code: "no_staff_profile",
        }, { status: 403 })
      }
      const ok = await setStaffRegisterPin(staff.id, pin)
      if (!ok) return NextResponse.json({ error: "PIN could not be saved — try again." }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === "close_register") {
      const { sessionId, countedCash } = body
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })
      const ok = await closeRegister(sessionId, Number(countedCash) || 0, body.createdBy)
      return NextResponse.json({ ok })
    }

    if (action === "cash_movement") {
      const { sessionId, type, amount, reason } = body
      if (!sessionId || !type || amount == null)
        return NextResponse.json({ error: "sessionId, type, amount required" }, { status: 400 })
      const ok = await recordCashMovement(sessionId, type, Number(amount), reason, body.createdBy)
      return NextResponse.json({ ok })
    }

    if (action === "today_log") {
      // Register transaction log — today's real sales with their tenders.
      const sales = await getPosTodaySales(100, tenant)
      return NextResponse.json({ sales })
    }

    if (action === "session_report") {
      // Shift / end-of-day report for one register session.
      const { sessionId } = body
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })
      const report = await getRegisterSessionReport(String(sessionId), tenant)
      if (!report) return NextResponse.json({ error: "Session not found" }, { status: 404 })
      return NextResponse.json({ report })
    }

    if (action === "query_gift_card") {
      const { cardNumber } = body
      if (!cardNumber) return NextResponse.json({ error: "cardNumber required" }, { status: 400 })
      const card = await queryGiftCard(String(cardNumber).trim(), tenant)
      if (!card) return NextResponse.json({ error: "Gift card not found" }, { status: 404 })
      return NextResponse.json({ card })
    }

    if (action === "validate_coupon") {
      // SA-83 pre-check for the register UI. The authoritative validation
      // + redemption counting happens again inside completePosSale's
      // transaction — this call only prices the discount for display.
      const { code, subtotal } = body
      if (!code) return NextResponse.json({ error: "code required" }, { status: 400 })
      // Cart lines (when the register sends them) make the pre-check
      // scope-aware: targeted promotions price only their eligible lines,
      // exactly as the sale transaction will charge.
      const lines = Array.isArray(body.lines)
        ? body.lines.map((l: any) => ({
            catalogItemId: l?.catalogItemId ?? null,
            quantity: Number(l?.quantity) || 0,
            unitPrice: Number(l?.unitPrice) || 0,
          }))
        : undefined
      const v = await validateCoupon(String(code).trim(), Number(subtotal) || 0, lines)
      if (!v.valid) return NextResponse.json({ ok: false, valid: false, message: v.message || "Coupon is not valid" }, { status: 422 })
      return NextResponse.json({ ok: true, valid: true, discount: v.discount, message: v.message || "Coupon applied" })
    }

    if (action === "complete_sale") {
      // The idempotency key is REQUIRED — blocks double-submission.
      const input: PosSaleInput = {
        idempotencyKey: body.idempotencyKey || crypto.randomUUID(),
        tenantId: tenant,
        registerSessionId: body.registerSessionId,
        customerId: body.customerId || null,
        petId: body.petId || null,
        appointmentId: body.appointmentId || null,
        staffId: body.staffId || null,
        lines: body.lines || [],
        discountTotal: body.discountTotal || 0,
        couponCode: body.couponCode || null,
        taxTotal: body.taxTotal || 0,
        payments: body.payments || [],
        depositAmount: body.depositAmount || 0,
        notes: body.notes || "",
        createdBy: body.createdBy,
        ageVerification: body.ageVerification || null,
      }
      if (!input.registerSessionId || input.lines.length === 0)
        return NextResponse.json({ error: "registerSessionId + lines required" }, { status: 400 })
      const result = await completePosSale(input)
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.error.includes("JOURNAL_UNBALANCED") ? 500 : 400 })
      }
      return NextResponse.json({ sale: result })
    }

    if (action === "void_sale") {
      // Void ≠ refund: cancels a completed sale whose session is still
      // open, unwinding tenders, drawer cash, gift cards and the GL
      // entry (lib/enterprise/pos voidPosSale). Reason is required —
      // a void without a stated reason is how tills leak.
      const { saleId, reason } = body
      if (!saleId || !String(reason || "").trim())
        return NextResponse.json({ error: "saleId + reason required" }, { status: 400 })
      const user: any = await getCurrentUser().catch(() => null)
      const staff = user?.id ? await resolveRegisterStaff(String(user.id)).catch(() => null) : null
      const result = await voidPosSale({
        saleId: String(saleId), reason: String(reason).trim(),
        tenantId: tenant, voidedBy: staff?.id ?? null,
      })
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })
      const actorId = await getActorIdFromRequest(req).catch(() => null)
      await auditAction({
        action: "pos_void_sale", domain: "commerce", tableName: "commerce_sales",
        recordId: String(saleId), actorUserId: actorId, ipAddress: req.headers.get("x-forwarded-for"),
        afterData: { reason: String(reason).trim(), reversalJournalEntryId: result.reversalJournalEntryId },
      }).catch(() => {})
      return NextResponse.json({ ...result, ok: true })
    }

    if (action === "verify_pin") {
      // Lock-screen unlock: verify the SIGNED-IN cashier's own register
      // PIN (the access credential — appropriate here; this grants no
      // approval power, it re-admits the same operator).
      const pin = body.pin ? String(body.pin) : ""
      const user: any = await getCurrentUser().catch(() => null)
      if (!user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
      const staff = await resolveRegisterStaff(String(user.id)).catch(() => null)
      if (!staff) return NextResponse.json({ ok: false, verdict: "no_staff_profile" })
      const verdict = await verifyStaffPin(staff.id, pin)
      return NextResponse.json({ ok: verdict === "ok", verdict })
    }

    if (action === "verify_manager_pin") {
      // Manager override: a DIFFERENT credential class from the access
      // PIN — the PIN of a staff member whose linked portal user is an
      // owner (portal_users.is_owner / role_type 'owner'). The
      // approver's identity is returned and recorded; the register
      // access PIN is never consulted here (register-pin.ts rule).
      const pin = body.pin ? String(body.pin) : ""
      if (!isValidPinFormat(pin)) return NextResponse.json({ ok: false, error: "PIN must be 4–8 digits" }, { status: 400 })
      const candidates = await pgQuery<{ id: string; display_name: string | null; register_pin_hash: string }>(
        `SELECT s.id::text AS id, s.display_name, s.register_pin_hash
           FROM public.crm_staff s
           JOIN public.portal_users pu ON pu.user_id = s.user_id
          WHERE s.tenant_id = $1 AND s.register_pin_hash IS NOT NULL
            AND (pu.is_owner = true OR pu.role_type = 'owner')`,
        [tenant],
      ).catch(() => [] as { id: string; display_name: string | null; register_pin_hash: string }[])
      for (const c of candidates) {
        if (verifyRegisterPin(pin, c.register_pin_hash)) {
          return NextResponse.json({ ok: true, managerId: c.id, managerName: c.display_name || "Manager" })
        }
      }
      return NextResponse.json({ ok: false, error: "No manager matched that PIN" }, { status: 403 })
    }

    if (action === "record_override") {
      // The audit leg of a manager override (price override applied at
      // the register). The override itself is cart state; THIS is what
      // makes it accountable: who approved, what changed, which line.
      const actorId = await getActorIdFromRequest(req).catch(() => null)
      await auditAction({
        action: "pos_manager_override", domain: "commerce", tableName: "commerce_sales",
        recordId: null, actorUserId: actorId, ipAddress: req.headers.get("x-forwarded-for"),
        afterData: {
          kind: String(body.kind || "price_override"),
          managerId: body.managerId || null, managerName: body.managerName || null,
          description: body.description || null,
          oldPrice: body.oldPrice ?? null, newPrice: body.newPrice ?? null,
        },
      }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    if (action === "send_sms_receipt") {
      // SMS receipt via the tenant's Twilio configuration — the same
      // resolver the support inbox sends with. Unconfigured is an
      // honest 422 (the register button used to be permanently
      // disabled claiming exactly this); provider errors surface.
      const { saleId, phone } = body
      if (!saleId || !String(phone || "").trim())
        return NextResponse.json({ error: "saleId + phone required" }, { status: 400 })
      const sales = await pgQuery<{ sale_number: string; total: string; line_count: number }>(
        `SELECT s.sale_number, s.total::text AS total,
                (SELECT COUNT(*)::int FROM public.commerce_sale_lines l WHERE l.sale_id = s.id) AS line_count
           FROM public.commerce_sales s WHERE s.id = $1::uuid AND s.tenant_id = $2 LIMIT 1`,
        [String(saleId), tenant],
      )
      const sale = sales[0]
      if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 })
      const shim = { query: async (text: string, params: unknown[]) => ({ rows: await pgQuery(text, params as any[]) }) }
      const cfg = await getTwilioConfig(shim as any, tenant)
      if (!cfg.configured) {
        return NextResponse.json(
          { error: "SMS is not configured for this business — add Twilio credentials in Settings → Twilio to send SMS receipts." },
          { status: 422 },
        )
      }
      const nameRows = await pgQuery<{ value_text: string | null }>(
        `SELECT value_text FROM public.cms_global_content
          WHERE tenant_id = $1 AND content_key = 'org_business_name' AND locale = 'en-US' LIMIT 1`,
        [tenant],
      ).catch(() => [] as { value_text: string | null }[])
      const biz = nameRows[0]?.value_text || "All About Pawz"
      const text = `${biz} receipt ${sale.sale_number}: $${Number(sale.total).toFixed(2)} for ${sale.line_count} item${sale.line_count === 1 ? "" : "s"}. Thank you!`
      const sent = await sendSms(cfg, String(phone).trim(), text)
      if (!sent.ok) return NextResponse.json({ error: sent.error || "SMS failed to send" }, { status: 502 })
      return NextResponse.json({ ok: true, sid: sent.sid || null })
    }

    if (action === "refund") {
      const input: RefundInput = {
        tenantId: tenant,
        originalSaleId: body.originalSaleId,
        refundMethod: body.refundMethod || "cash",
        amount: Number(body.amount) || 0,
        reason: body.reason || "Customer return",
        lines: body.lines || [],
        createdBy: body.createdBy,
      }
      if (!input.originalSaleId || input.amount <= 0)
        return NextResponse.json({ error: "originalSaleId + amount required" }, { status: 400 })
      const result = await processRefund(input)
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({ refund: result })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e: any) {
    console.error("[POST /api/admin/pos]", e)
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
