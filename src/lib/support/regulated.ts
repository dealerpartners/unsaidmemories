// ============================================================================
// Support §6 REGULATED CASE DETAILS — the writer side (spec:
// support-desk-enterprise-tree.md §6, lines 103–127).
//
// Until this module, the §6 side tables were live and §18-gated but had
// ZERO writers or readers in code (enterprise audit, 2026-10-14): the
// public /dmca intake wrote dmca_details, the desk's dmca route stamped
// four dates, and nothing else in the family was ever written — no
// counter notices, no strikes, no takedown log, no designated agent, no
// privacy / chargeback / case details, and the Stripe dispute webhook
// filed its ticket without the chargeback_details row the ticket exists
// to carry. This module is the writer layer for all of it.
//
// Gate model (§18): the per-code gates (support.dmca / support.privacy)
// live in RLS policy text and resolve through
// platform_has_permission(tenant, code) = platform admin OR a
// platform_module_permissions grant on the code's registry module at
// write/full. Every support.* code is bound to module 'support' in
// platform_permission_registry, so at the app layer — where the desk
// already runs — the operative equivalent is the module gate the desk
// routes use (requireModuleApi("support", …)); these writers assume
// that gate has passed and enforce tenancy themselves: tenant_id is a
// predicate in every statement below.
//
// Documented residuals (migration 20261044) are conformed to, never
// tightened here: chargeback_details INSERT keeps its membership path
// (its UPDATE/DELETE are fully permission-gated); privacy_request_
// details SELECT keeps its dual path.
//
// Audit: staff mutations append to public.crm_audit_log — the §18
// admin change log the §10 config writers use — with entity_type = the
// table and before/after images. Like that module's audit, a failed
// audit write never breaks the mutation; it is logged to stderr.
// System filings (the dispute webhook) pass actor = null and are NOT
// written to crm_audit_log: their trail is the ticket, its message,
// and its events, which the webhook already writes.
// ============================================================================

export interface RegulatedDb {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type Db = RegulatedDb

export interface RegulatedActor {
  userId: string | null
  staffId: string | null
  ip: string | null
  userAgent: string | null
}

export class RegulatedError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Repeat-infringer threshold (tree §6 line 117–118: dmca_strikes —
 * "repeat-infringer thresholds → seller suspension workflow"). At this
 * many ACTIVE strikes, the case surfaces to the seller-governance side
 * as an open seller_violations record in the Trust Center queue, where
 * suspension is decided and executed. Support code never suspends a
 * seller itself. 3 matches the platform's repeat-offender threshold
 * used by content moderation.
 */
export const DMCA_REPEAT_INFRINGER_THRESHOLD = 3

// ── Audit (§18 change log; mirrors config-admin.ts) ──────────────────

async function auditRegulatedChange(
  c: Db,
  tenantId: string,
  actor: RegulatedActor,
  table: string,
  rowId: string | null,
  verb: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  try {
    await c.query(
      `INSERT INTO public.crm_audit_log
         (tenant_id, actor_user_id, actor_staff_id, entity_type, entity_id, action, before_data, after_data, ip_address, user_agent)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::jsonb, $8::jsonb, $9::inet, $10)`,
      [
        tenantId, actor.userId, actor.staffId, table, rowId,
        `support_regulated_${verb}`,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        actor.ip, actor.userAgent,
      ],
    )
  } catch (e) {
    console.error(
      `[support-regulated] audit write failed for ${table}/${verb}:`,
      e instanceof Error ? e.message : String(e),
    )
  }
}

// ── §512(g) restore window ────────────────────────────────────────────
// After a counter notice is forwarded to the complainant, material may
// be restored no sooner than 10 and no later than 14 BUSINESS days
// after forwarding, unless the complainant files suit in the window.
// Business days here skip weekends; federal holidays are not modeled.

export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from)
  let added = 0
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1)
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) added++
  }
  return d
}

// ── dmca_takedown_log — append-only case trail (tree line 120) ───────

export async function appendTakedownLog(
  c: Db,
  tenantId: string,
  entry: {
    ticketId: string
    dmcaDetailsId?: string | null
    action: string
    listingRef?: string | null
    sellerId?: string | null
    actorStaffId?: string | null
    detail?: Record<string, unknown>
  },
): Promise<void> {
  await c.query(
    `INSERT INTO public.dmca_takedown_log
       (tenant_id, ticket_id, dmca_details_id, action, listing_ref, seller_id, actor_staff_id, detail)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid, $7::uuid, $8::jsonb)`,
    [
      tenantId, entry.ticketId, entry.dmcaDetailsId ?? null, entry.action,
      entry.listingRef ?? null, entry.sellerId ?? null, entry.actorStaffId ?? null,
      JSON.stringify(entry.detail ?? {}),
    ],
  )
}

export async function listTakedownLog(c: Db, tenantId: string, ticketId: string) {
  const { rows } = await c.query(
    `SELECT id::text AS id, action, listing_ref, seller_id::text AS seller_id,
            actor_staff_id::text AS actor_staff_id, detail, created_at::text AS created_at
       FROM public.dmca_takedown_log
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
      ORDER BY created_at ASC LIMIT 500`,
    [tenantId, ticketId],
  )
  return rows
}

// ── dmca_strikes + the governance surfacing (tree lines 117–118) ─────

export interface StrikeOutcome {
  strikeId: string
  activeStrikes: number
  governanceCaseId: string | null
  governanceCaseOpened: boolean
}

/**
 * Issue the strike an actioned takedown earns against its target
 * seller. Idempotent per ticket: a ticket actioned twice (workflow
 * bounced and re-actioned) still carries ONE strike. When the strike
 * takes the seller to the repeat-infringer threshold, an OPEN
 * seller_violations record is filed into the Trust Center queue (once —
 * an already-open case is not duplicated). Suspension itself remains
 * a governance-side act executed from that queue; nothing here touches
 * sellers.status.
 */
export async function issueStrikeForTakedown(
  c: Db,
  tenantId: string,
  ticket: { id: string; ticketRef: string },
  details: Record<string, any>,
  actor: RegulatedActor | null,
): Promise<StrikeOutcome | null> {
  const sellerId = details.target_seller_id as string | null
  if (!sellerId) return null

  const existing = await c.query(
    `SELECT id::text AS id FROM public.dmca_strikes
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND status = 'active' LIMIT 1`,
    [tenantId, ticket.id],
  )
  let strikeId = existing.rows[0]?.id as string | undefined
  if (!strikeId) {
    const ins = await c.query(
      `INSERT INTO public.dmca_strikes (tenant_id, ticket_id, seller_id, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'active')
       RETURNING id::text AS id`,
      [tenantId, ticket.id, sellerId],
    )
    strikeId = ins.rows[0].id
    await appendTakedownLog(c, tenantId, {
      ticketId: ticket.id,
      dmcaDetailsId: details.id ?? null,
      action: "strike_issued",
      listingRef: details.target_listing_ref ?? null,
      sellerId,
      actorStaffId: actor?.staffId ?? null,
      detail: { strikeId },
    })
  }

  const count = await c.query(
    `SELECT count(*)::int AS n FROM public.dmca_strikes
      WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND status = 'active'`,
    [tenantId, sellerId],
  )
  const activeStrikes = count.rows[0].n as number

  let governanceCaseId: string | null = null
  let governanceCaseOpened = false
  if (activeStrikes >= DMCA_REPEAT_INFRINGER_THRESHOLD) {
    const open = await c.query(
      `SELECT id::text AS id FROM public.seller_violations
        WHERE tenant_id = $1::uuid AND seller_id = $2::uuid
          AND violation_type = 'dmca_repeat_infringer' AND status = 'open' LIMIT 1`,
      [tenantId, sellerId],
    )
    if (open.rows[0]) {
      governanceCaseId = open.rows[0].id
    } else {
      const v = await c.query(
        `INSERT INTO public.seller_violations
           (tenant_id, seller_id, violation_type, severity, status, description, evidence)
         VALUES ($1::uuid, $2::uuid, 'dmca_repeat_infringer', 'high', 'open', $3, $4::jsonb)
         RETURNING id::text AS id`,
        [
          tenantId, sellerId,
          `Repeat-infringer threshold reached: ${activeStrikes} active DMCA strikes. ` +
            `Latest strike issued from support ticket ${ticket.ticketRef}. ` +
            `Suspension is a Trust Center decision on this case.`,
          JSON.stringify({ activeStrikes, latestTicketId: ticket.id, latestTicketRef: ticket.ticketRef, latestStrikeId: strikeId }),
        ],
      )
      governanceCaseId = v.rows[0].id
      governanceCaseOpened = true
      await appendTakedownLog(c, tenantId, {
        ticketId: ticket.id,
        dmcaDetailsId: details.id ?? null,
        action: "governance_case_opened",
        sellerId,
        actorStaffId: actor?.staffId ?? null,
        detail: { governanceCaseId, activeStrikes, threshold: DMCA_REPEAT_INFRINGER_THRESHOLD },
      })
    }
  }

  return { strikeId: strikeId!, activeStrikes, governanceCaseId, governanceCaseOpened }
}

export async function rescindStrike(
  c: Db,
  tenantId: string,
  ticket: { id: string },
  strikeId: string,
  actor: RegulatedActor,
): Promise<Record<string, any>> {
  const { rows } = await c.query(
    `UPDATE public.dmca_strikes
        SET status = 'rescinded', row_version = row_version + 1, updated_at = now()
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND id = $3::uuid AND status = 'active'
      RETURNING *`,
    [tenantId, ticket.id, strikeId],
  )
  if (!rows[0]) {
    throw new RegulatedError(404, "No active strike with that id on this ticket")
  }
  await appendTakedownLog(c, tenantId, {
    ticketId: ticket.id,
    action: "strike_rescinded",
    sellerId: rows[0].seller_id ?? null,
    actorStaffId: actor.staffId,
    detail: { strikeId },
  })
  await auditRegulatedChange(c, tenantId, actor, "dmca_strikes", strikeId, "strike_rescinded", null, rows[0])
  return rows[0]
}

export async function listStrikes(c: Db, tenantId: string, ticketId: string) {
  const { rows } = await c.query(
    `SELECT * FROM public.dmca_strikes
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
      ORDER BY strike_at ASC`,
    [tenantId, ticketId],
  )
  return rows
}

// ── DMCA transition effects ───────────────────────────────────────────
// Called by the desk's dmca route AFTER its workflow UPDATE lands, with
// the before/after images of the dmca_details row. Writes the takedown
// log entries the transition earns and, at actioned_takedown, the
// listing snapshot + the strike. The route's own UPDATE stamps
// takedown_at/takedown_by/restored_by (it owns the acting staff id).

export async function recordDmcaTransition(
  c: Db,
  tenantId: string,
  ticket: { id: string; ticketRef: string },
  before: Record<string, any>,
  after: Record<string, any>,
  actor: RegulatedActor | null,
): Promise<{ strike: StrikeOutcome | null }> {
  const from = before.workflow_status as string
  const to = after.workflow_status as string
  let strike: StrikeOutcome | null = null
  if (from === to) return { strike }

  const base = {
    ticketId: ticket.id,
    dmcaDetailsId: (after.id as string) ?? null,
    listingRef: after.target_listing_ref ?? null,
    sellerId: after.target_seller_id ?? null,
    actorStaffId: actor?.staffId ?? null,
  }

  if (to === "actioned_takedown") {
    // Snapshot the takedown target as it stood when actioned — the
    // case file keeps what was removed even if the listing later
    // changes or disappears.
    const snapshot = (after.target_listing_snapshot ?? {}) as Record<string, unknown>
    if (!snapshot || Object.keys(snapshot).length === 0) {
      const snap = {
        listing_ref: after.target_listing_ref ?? null,
        seller_id: after.target_seller_id ?? null,
        infringing_urls: after.infringing_urls ?? [],
        captured_at: new Date().toISOString(),
        captured_by: actor?.staffId ?? null,
      }
      await c.query(
        `UPDATE public.dmca_details
            SET target_listing_snapshot = $3::jsonb, updated_at = now()
          WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
        [tenantId, ticket.id, JSON.stringify(snap)],
      )
    }
    await appendTakedownLog(c, tenantId, { ...base, action: "takedown", detail: { from, to } })
    strike = await issueStrikeForTakedown(c, tenantId, ticket, after, actor)
  } else if (to === "uploader_notified") {
    await appendTakedownLog(c, tenantId, { ...base, action: "uploader_notified", detail: { from, to } })
  } else if (to === "counter_notice_window") {
    await appendTakedownLog(c, tenantId, { ...base, action: "counter_notice_window", detail: { from, to } })
  } else if (to === "restored") {
    await appendTakedownLog(c, tenantId, { ...base, action: "restored", detail: { from, to } })
  } else if (to === "closed" || to === "closed_no_restore" || to === "rejected_no_action") {
    await appendTakedownLog(c, tenantId, { ...base, action: "closed", detail: { from, to } })
  }

  return { strike }
}

// ── dmca_counter_notices (tree lines 114–116) ────────────────────────
// §512(g)(3) elements, computed like the takedown intake computes its
// §512(c)(3)(A) set — a deficient counter notice is recorded with its
// missing elements, never silently dropped.

export interface CounterNoticeInput {
  submitterName?: string | null
  submitterEmail?: string | null
  submitterAddress?: string | null
  submitterPhone?: string | null
  signature?: string | null
  priorLocation?: string | null
  jurisdictionConsent?: boolean
  perjury?: boolean
}

export function counterNoticeMissingElements(input: CounterNoticeInput): string[] {
  const missing: string[] = []
  if (!String(input.signature || "").trim()) missing.push("signature")
  if (!String(input.priorLocation || "").trim()) missing.push("removed_material_identification")
  if (input.perjury !== true) missing.push("perjury_statement")
  if (!String(input.submitterName || "").trim()) missing.push("submitter_name")
  if (!String(input.submitterAddress || "").trim()) missing.push("submitter_address")
  if (!String(input.submitterPhone || "").trim()) missing.push("submitter_phone")
  if (input.jurisdictionConsent !== true) missing.push("jurisdiction_consent")
  return missing
}

export async function fileCounterNotice(
  c: Db,
  tenantId: string,
  ticket: { id: string },
  details: Record<string, any>,
  input: CounterNoticeInput,
): Promise<{ row: Record<string, any>; missing: string[]; complete: boolean }> {
  const missing = counterNoticeMissingElements(input)
  const complete = missing.length === 0
  const { rows } = await c.query(
    `INSERT INTO public.dmca_counter_notices
       (tenant_id, ticket_id, dmca_details_id, submitter_name, submitter_email,
        submitter_address, submitter_phone, submitter_signature_text, signed_at,
        prior_location, jurisdiction_consent, perjury_attested,
        elements_complete, missing_elements)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, now(), $9, $10, $11, $12, $13::jsonb)
     RETURNING *`,
    [
      tenantId, ticket.id, details.id,
      String(input.submitterName || "").trim() || null,
      String(input.submitterEmail || "").trim() || null,
      String(input.submitterAddress || "").trim() || null,
      String(input.submitterPhone || "").trim() || null,
      String(input.signature || "").trim() || null,
      String(input.priorLocation || "").trim() || null,
      input.jurisdictionConsent === true, input.perjury === true,
      complete, JSON.stringify(missing),
    ],
  )
  const row = rows[0]

  await appendTakedownLog(c, tenantId, {
    ticketId: ticket.id,
    dmcaDetailsId: details.id,
    action: "counter_notice_received",
    listingRef: details.target_listing_ref ?? null,
    sellerId: details.target_seller_id ?? null,
    actorStaffId: null,
    detail: { counterNoticeId: row.id, elementsComplete: complete, missingElements: missing },
  })

  // Receipt of a counter notice opens the §512(g) window on the case.
  if (details.workflow_status === "actioned_takedown" || details.workflow_status === "uploader_notified") {
    await c.query(
      `UPDATE public.dmca_details
          SET workflow_status = 'counter_notice_window', row_version = row_version + 1, updated_at = now()
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
      [tenantId, ticket.id],
    )
  }

  return { row, missing, complete }
}

export async function listCounterNotices(c: Db, tenantId: string, ticketId: string) {
  const { rows } = await c.query(
    `SELECT * FROM public.dmca_counter_notices
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
      ORDER BY received_at ASC`,
    [tenantId, ticketId],
  )
  return rows
}

/**
 * Desk stamps on a counter notice. 'forward' records the §512(g)(2)
 * forwarding to the complainant and computes the restore window on
 * the case (10–14 business days out). 'suit_notice' records that the
 * complainant notified the shop of a court filing, which stops the
 * restoration clock.
 */
export async function stampCounterNotice(
  c: Db,
  tenantId: string,
  ticket: { id: string },
  details: Record<string, any>,
  counterNoticeId: string,
  action: "forward" | "suit_notice",
  actor: RegulatedActor,
): Promise<{ counterNotice: Record<string, any>; restoreWindow: { notBefore: string; notAfter: string } | null }> {
  const cur = await c.query(
    `SELECT * FROM public.dmca_counter_notices
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND id = $3::uuid LIMIT 1`,
    [tenantId, ticket.id, counterNoticeId],
  )
  const notice = cur.rows[0]
  if (!notice) throw new RegulatedError(404, "Counter notice not found on this ticket")

  let restoreWindow: { notBefore: string; notAfter: string } | null = null
  let updated: Record<string, any>
  if (action === "forward") {
    const stamped = await c.query(
      `UPDATE public.dmca_counter_notices
          SET forwarded_to_complainant_at = COALESCE(forwarded_to_complainant_at, now()),
              row_version = row_version + 1, updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid
        RETURNING *`,
      [tenantId, counterNoticeId],
    )
    updated = stamped.rows[0]
    const forwardedAt = new Date(updated.forwarded_to_complainant_at as string)
    const notBefore = addBusinessDays(forwardedAt, 10)
    const notAfter = addBusinessDays(forwardedAt, 14)
    restoreWindow = { notBefore: notBefore.toISOString(), notAfter: notAfter.toISOString() }
    await c.query(
      `UPDATE public.dmca_details
          SET restore_not_before_at = $3::timestamptz, restore_not_after_at = $4::timestamptz,
              row_version = row_version + 1, updated_at = now()
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
      [tenantId, ticket.id, restoreWindow.notBefore, restoreWindow.notAfter],
    )
    await appendTakedownLog(c, tenantId, {
      ticketId: ticket.id,
      dmcaDetailsId: details.id,
      action: "counter_notice_forwarded",
      actorStaffId: actor.staffId,
      detail: { counterNoticeId, restoreNotBeforeAt: restoreWindow.notBefore, restoreNotAfterAt: restoreWindow.notAfter },
    })
  } else {
    const stamped = await c.query(
      `UPDATE public.dmca_counter_notices
          SET complainant_suit_notice_at = COALESCE(complainant_suit_notice_at, now()),
              row_version = row_version + 1, updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid
        RETURNING *`,
      [tenantId, counterNoticeId],
    )
    updated = stamped.rows[0]
    await appendTakedownLog(c, tenantId, {
      ticketId: ticket.id,
      dmcaDetailsId: details.id,
      action: "complainant_suit_notice",
      actorStaffId: actor.staffId,
      detail: { counterNoticeId },
    })
  }
  await auditRegulatedChange(c, tenantId, actor, "dmca_counter_notices", counterNoticeId,
    action === "forward" ? "counter_notice_forwarded" : "complainant_suit_notice", notice, updated)
  return { counterNotice: updated, restoreWindow }
}

// ── dmca_designated_agent (tree line 119) — one record per tenant ────

export async function getDesignatedAgent(c: Db, tenantId: string) {
  const { rows } = await c.query(
    `SELECT * FROM public.dmca_designated_agent WHERE tenant_id = $1::uuid LIMIT 1`,
    [tenantId],
  )
  return rows[0] ?? null
}

export async function upsertDesignatedAgent(
  c: Db,
  tenantId: string,
  input: {
    agentName?: string | null
    agentEmail?: string | null
    agentAddress?: string | null
    agentPhone?: string | null
    registeredAt?: string | null
    renewalDueAt?: string | null
  },
  actor: RegulatedActor,
): Promise<Record<string, any>> {
  const before = await getDesignatedAgent(c, tenantId)
  const { rows } = await c.query(
    `INSERT INTO public.dmca_designated_agent
       (tenant_id, agent_name, agent_email, agent_address, agent_phone, registered_at, renewal_due_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
     ON CONFLICT (tenant_id) DO UPDATE SET
       agent_name = EXCLUDED.agent_name,
       agent_email = EXCLUDED.agent_email,
       agent_address = EXCLUDED.agent_address,
       agent_phone = EXCLUDED.agent_phone,
       registered_at = EXCLUDED.registered_at,
       renewal_due_at = EXCLUDED.renewal_due_at,
       row_version = public.dmca_designated_agent.row_version + 1,
       updated_at = now()
     RETURNING *`,
    [
      tenantId,
      input.agentName ?? null, input.agentEmail ?? null,
      input.agentAddress ?? null, input.agentPhone ?? null,
      input.registeredAt ?? null, input.renewalDueAt ?? null,
    ],
  )
  await auditRegulatedChange(c, tenantId, actor, "dmca_designated_agent", rows[0].id,
    before ? "agent_updated" : "agent_created", before, rows[0])
  return rows[0]
}

// ── privacy_request_details (tree lines 121–123) ─────────────────────

export const PRIVACY_REQUEST_TYPES = ["access", "deletion", "correction", "opt_out"] as const

export async function getPrivacyDetails(c: Db, tenantId: string, ticketId: string) {
  const { rows } = await c.query(
    `SELECT * FROM public.privacy_request_details
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid LIMIT 1`,
    [tenantId, ticketId],
  )
  return rows[0] ?? null
}

export async function upsertPrivacyDetails(
  c: Db,
  tenantId: string,
  ticketId: string,
  input: {
    requestType?: string
    identityVerified?: boolean
    verificationMethod?: string | null
    statutoryDueAt?: string | null
    extensionGranted?: boolean
    outcome?: string | null
    fulfillmentNote?: string | null
  },
  actor: RegulatedActor,
): Promise<Record<string, any>> {
  if (input.requestType !== undefined && !(PRIVACY_REQUEST_TYPES as readonly string[]).includes(input.requestType)) {
    throw new RegulatedError(400, `Unknown request type "${input.requestType}"`)
  }
  const before = await getPrivacyDetails(c, tenantId, ticketId)

  if (!before) {
    if (!input.requestType) {
      throw new RegulatedError(400, "requestType is required to open a privacy request record")
    }
    const fulfillment = input.fulfillmentNote
      ? [{ at: new Date().toISOString(), by: actor.staffId, note: input.fulfillmentNote }]
      : []
    const { rows } = await c.query(
      `INSERT INTO public.privacy_request_details
         (tenant_id, ticket_id, request_type, identity_verified_at, verification_method,
          statutory_due_at, extension_granted_at, fulfillment_log, outcome)
       VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5, $6::timestamptz, $7::timestamptz, $8::jsonb, $9)
       RETURNING *`,
      [
        tenantId, ticketId, input.requestType,
        input.identityVerified ? new Date().toISOString() : null,
        input.verificationMethod ?? null,
        input.statutoryDueAt ?? null,
        input.extensionGranted ? new Date().toISOString() : null,
        JSON.stringify(fulfillment),
        input.outcome ?? null,
      ],
    )
    await auditRegulatedChange(c, tenantId, actor, "privacy_request_details", rows[0].id, "privacy_created", null, rows[0])
    return rows[0]
  }

  const sets: string[] = ["row_version = row_version + 1", "updated_at = now()"]
  const args: any[] = [tenantId, ticketId]
  const push = (sql: string, v: unknown) => { args.push(v); sets.push(sql.replace("?", `$${args.length}`)) }
  if (input.requestType !== undefined) push("request_type = ?", input.requestType)
  if (input.identityVerified === true && !before.identity_verified_at) sets.push("identity_verified_at = now()")
  if (input.verificationMethod !== undefined) push("verification_method = ?", input.verificationMethod)
  if (input.statutoryDueAt !== undefined) push("statutory_due_at = ?::timestamptz", input.statutoryDueAt)
  if (input.extensionGranted === true && !before.extension_granted_at) sets.push("extension_granted_at = now()")
  if (input.outcome !== undefined) push("outcome = ?", input.outcome)
  if (input.fulfillmentNote) {
    push("fulfillment_log = fulfillment_log || ?::jsonb",
      JSON.stringify([{ at: new Date().toISOString(), by: actor.staffId, note: input.fulfillmentNote }]))
  }
  const { rows } = await c.query(
    `UPDATE public.privacy_request_details SET ${sets.join(", ")}
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
      RETURNING *`,
    args,
  )
  await auditRegulatedChange(c, tenantId, actor, "privacy_request_details", rows[0].id, "privacy_updated", before, rows[0])
  return rows[0]
}

// ── chargeback_details (tree lines 124–125) ─────────────────────────

export async function getChargebackDetails(c: Db, tenantId: string, ticketId: string) {
  const { rows } = await c.query(
    `SELECT * FROM public.chargeback_details
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid LIMIT 1`,
    [tenantId, ticketId],
  )
  return rows[0] ?? null
}

export interface ChargebackFields {
  disputeId?: string | null
  processor?: string | null
  amount?: number | null
  processorDeadlineAt?: string | null
  evidencePackageRef?: string | null
  outcome?: string | null
}

/**
 * Create-or-update the ticket's chargeback record. Only keys PRESENT
 * in `fields` are written (an explicit null clears). Setting `outcome`
 * stamps outcome_at. The dispute webhook calls this with actor = null
 * at filing time; the desk calls it for evidence/deadline/outcome work.
 */
export async function upsertChargebackDetails(
  c: Db,
  tenantId: string,
  ticketId: string,
  fields: ChargebackFields,
  actor: RegulatedActor | null,
): Promise<Record<string, any>> {
  const before = await getChargebackDetails(c, tenantId, ticketId)
  const cols: [keyof ChargebackFields, string][] = [
    ["disputeId", "dispute_id"],
    ["processor", "processor"],
    ["amount", "amount"],
    ["processorDeadlineAt", "processor_deadline_at"],
    ["evidencePackageRef", "evidence_package_ref"],
    ["outcome", "outcome"],
  ]
  const present = cols.filter(([k]) => fields[k] !== undefined)

  if (!before) {
    const names = ["tenant_id", "ticket_id", ...present.map(([, col]) => col)]
    const vals: unknown[] = [tenantId, ticketId]
    const ph: string[] = ["$1::uuid", "$2::uuid"]
    for (const [k, col] of present) {
      vals.push(fields[k] ?? null)
      ph.push(col === "processor_deadline_at" ? `$${vals.length}::timestamptz` : `$${vals.length}`)
    }
    if (fields.outcome !== undefined) { names.push("outcome_at"); ph.push("now()") }
    const { rows } = await c.query(
      `INSERT INTO public.chargeback_details (${names.join(", ")}) VALUES (${ph.join(", ")}) RETURNING *`,
      vals,
    )
    if (actor) {
      await auditRegulatedChange(c, tenantId, actor, "chargeback_details", rows[0].id, "chargeback_created", null, rows[0])
    }
    return rows[0]
  }

  if (present.length === 0) return before
  const sets: string[] = ["row_version = row_version + 1", "updated_at = now()"]
  const args: any[] = [tenantId, ticketId]
  for (const [k, col] of present) {
    args.push(fields[k] ?? null)
    sets.push(col === "processor_deadline_at" ? `${col} = $${args.length}::timestamptz` : `${col} = $${args.length}`)
  }
  if (fields.outcome !== undefined) sets.push("outcome_at = now()")
  const { rows } = await c.query(
    `UPDATE public.chargeback_details SET ${sets.join(", ")}
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
      RETURNING *`,
    args,
  )
  if (actor) {
    await auditRegulatedChange(c, tenantId, actor, "chargeback_details", rows[0].id, "chargeback_updated", before, rows[0])
  }
  return rows[0]
}

/** A dispute closing stamps its outcome — update-only: a close event
 *  for a ticket filed before this writer existed must not fabricate a
 *  half-empty record; the ticket message already carries the outcome. */
export async function stampChargebackOutcome(
  c: Db,
  tenantId: string,
  ticketId: string,
  outcome: string,
): Promise<void> {
  await c.query(
    `UPDATE public.chargeback_details
        SET outcome = $3, outcome_at = now(), row_version = row_version + 1, updated_at = now()
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
    [tenantId, ticketId, outcome],
  )
}

// ── support_case_details (tree lines 126–127) ────────────────────────

export const CASE_TYPES = ["legal", "law_enforcement", "trust_safety"] as const

export async function getCaseDetails(c: Db, tenantId: string, ticketId: string) {
  const { rows } = await c.query(
    `SELECT * FROM public.support_case_details
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid LIMIT 1`,
    [tenantId, ticketId],
  )
  return rows[0] ?? null
}

export async function upsertCaseDetails(
  c: Db,
  tenantId: string,
  ticketId: string,
  input: {
    caseType?: string
    deadlineAt?: string | null
    status?: string | null
    payload?: Record<string, unknown>
    legalHold?: boolean
  },
  actor: RegulatedActor,
): Promise<Record<string, any>> {
  if (input.caseType !== undefined && !(CASE_TYPES as readonly string[]).includes(input.caseType)) {
    throw new RegulatedError(400, `Unknown case type "${input.caseType}"`)
  }
  const before = await getCaseDetails(c, tenantId, ticketId)

  if (!before) {
    if (!input.caseType) {
      throw new RegulatedError(400, "caseType is required to open a case record")
    }
    const { rows } = await c.query(
      `INSERT INTO public.support_case_details
         (tenant_id, ticket_id, case_type, deadline_at, status, payload, legal_hold)
       VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5, $6::jsonb, $7)
       RETURNING *`,
      [
        tenantId, ticketId, input.caseType,
        input.deadlineAt ?? null,
        input.status ?? "open",
        JSON.stringify(input.payload ?? {}),
        input.legalHold === true,
      ],
    )
    await auditRegulatedChange(c, tenantId, actor, "support_case_details", rows[0].id, "case_created", null, rows[0])
    return rows[0]
  }

  const sets: string[] = ["row_version = row_version + 1", "updated_at = now()"]
  const args: any[] = [tenantId, ticketId]
  const push = (sql: string, v: unknown) => { args.push(v); sets.push(sql.replace("?", `$${args.length}`)) }
  if (input.caseType !== undefined) push("case_type = ?", input.caseType)
  if (input.deadlineAt !== undefined) push("deadline_at = ?::timestamptz", input.deadlineAt)
  if (input.status !== undefined) push("status = ?", input.status)
  if (input.payload !== undefined) push("payload = ?::jsonb", JSON.stringify(input.payload))
  if (input.legalHold !== undefined) push("legal_hold = ?", input.legalHold)
  const { rows } = await c.query(
    `UPDATE public.support_case_details SET ${sets.join(", ")}
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
      RETURNING *`,
    args,
  )
  await auditRegulatedChange(c, tenantId, actor, "support_case_details", rows[0].id, "case_updated", before, rows[0])
  return rows[0]
}
