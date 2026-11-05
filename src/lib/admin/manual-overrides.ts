// ---------------------------------------------------------------------------
// manual-overrides.ts — K2 · Manual Overrides: governed acts on real
// records, never shadow writes.
//
// RECORD: public.admin_manual_overrides (migration 20261064, created live
// 2026-10-14 — the tree designs K2 and no override record existed). Every
// override writes before_value + after_value + a REQUIRED reason + actor,
// inside ONE transaction with the act itself: the record and the mechanism
// land together or not at all.
//
// THE FIVE TREE LEAVES AND THEIR GOVERNED MECHANISMS (all firsthand):
//   price      → seller_listings.price — the listing's own price field,
//                the same column the seller portal's product writes set.
//   commission → sellers.commission_rate — the DB CHECK holds it to
//                [0, 1] (sellers_commission_rate_check); an out-of-range
//                value is refused here and would be refused by the store.
//   kpi        → seller_metric_facts — a manual fact whose dimension
//                carries {source: 'manual_override', override_id, reason}.
//                §I's reader (api/admin/analytics/sellers) serves the
//                manual fact preferentially for its (seller, metric_key),
//                and §I's compute writer never deletes manual rows — the
//                computed facts continue underneath, labeled by absence of
//                the marker. Targets any key in the tenant's seeded
//                seller_metric_definitions / seller_kpi_definitions.
//   status     → the actor record's own status field, per portal:
//                seller → sellers.status (CHECK: applied|approved|
//                suspended|closed); employee → crm_staff.is_active (the
//                activation every module gate reads); customer →
//                customers."customerStatus" (the shop account status —
//                free text in the wild, no DB vocabulary; the override
//                record is the governance on the act).
//   hold       → seller_payouts.status through the E1 desk's own
//                transition map (src/app/api/admin/payouts/route.ts):
//                hold: pending|approved → on_hold; release: on_hold →
//                pending. An override hold/release IS an E1 transition,
//                recorded additionally as an override. 'paid'/'failed'
//                are processor outcomes — never written here, exactly as
//                the E1 desk refuses them.
//
// AUDIT: the route appends crm_audit_log (auditAction) for every act and
// seller_audit_log (writeSellerAudit) whenever a seller is the subject.
// ---------------------------------------------------------------------------

interface PgClientLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>
}

export const OVERRIDE_TYPES = ["price", "commission", "kpi", "status", "hold"] as const
export type OverrideType = (typeof OVERRIDE_TYPES)[number]

export const SELLER_STATUS_VOCAB = ["applied", "approved", "suspended", "closed"] as const

export class OverrideError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface ApplyOverrideInput {
  tenantId: string
  overrideType: OverrideType
  targetType: string
  targetId: string
  /** price/commission/kpi: number · status: string (staff: boolean) · hold: { action: 'hold' | 'release' } */
  newValue: unknown
  metricKey?: string | null
  reason: string
  actorId: string | null
  actorEmail: string | null
  ip: string | null
  revertsOverrideId?: string | null
  /** The platform (env) tenant — admits unstamped legacy customer rows
   *  under it, the population the customer notification writer serves. */
  platformTenantId?: string
}

export interface ApplyOverrideResult {
  overrideId: string
  field: string
  before: Record<string, unknown> | null
  after: Record<string, unknown>
  targetLabel: string | null
  sellerId: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function num(v: unknown, what: string): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) throw new OverrideError(400, `${what} must be a number`)
  return n
}

export async function applyOverride(
  client: PgClientLike,
  input: ApplyOverrideInput,
): Promise<ApplyOverrideResult> {
  const { tenantId } = input
  await client.query("BEGIN")
  try {
    const result = await applyInTx(client, input)
    // Record first-class: the override row is inserted inside the same
    // transaction (see applyInTx), so COMMIT carries record + mechanism.
    await client.query("COMMIT")
    return result
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  }
}

async function insertRecord(
  client: PgClientLike,
  input: ApplyOverrideInput,
  fields: {
    targetLabel: string | null
    field: string
    before: Record<string, unknown> | null
    after: Record<string, unknown>
  },
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO public.admin_manual_overrides
       (tenant_id, override_type, target_type, target_id, target_label, field,
        before_value, after_value, reason, actor_id, actor_email,
        reverts_override_id, ip_address)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::uuid, $11, $12::uuid, $13)
     RETURNING id::text AS id`,
    [
      input.tenantId,
      input.overrideType,
      input.targetType,
      input.targetId,
      fields.targetLabel,
      fields.field,
      fields.before ? JSON.stringify(fields.before) : null,
      JSON.stringify(fields.after),
      input.reason,
      input.actorId,
      input.actorEmail,
      input.revertsOverrideId ?? null,
      input.ip,
    ],
  )
  return String(rows[0].id)
}

async function applyInTx(client: PgClientLike, input: ApplyOverrideInput): Promise<ApplyOverrideResult> {
  const { tenantId, overrideType, targetId } = input

  if (overrideType === "price") {
    if (input.targetType !== "seller_listing" || !UUID_RE.test(targetId)) {
      throw new OverrideError(400, "price overrides target a seller_listing by uuid")
    }
    const price = num(input.newValue, "price")
    if (price < 0) throw new OverrideError(400, "price cannot be negative")
    const { rows } = await client.query(
      `SELECT id::text AS id, price::float AS price, title, seller_id::text AS seller_id
         FROM public.seller_listings
        WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE`,
      [targetId, tenantId],
    )
    const r = rows[0]
    if (!r) throw new OverrideError(404, "listing not found in this tenant")
    const before = { price: r.price }
    const after = { price }
    const overrideId = await insertRecord(client, input, {
      targetLabel: String(r.title), field: "price", before, after,
    })
    await client.query(
      `UPDATE public.seller_listings SET price = $1, updated_at = now()
        WHERE id = $2::uuid AND tenant_id = $3::uuid`,
      [price, targetId, tenantId],
    )
    return { overrideId, field: "price", before, after, targetLabel: String(r.title), sellerId: r.seller_id }
  }

  if (overrideType === "commission") {
    if (input.targetType !== "seller" || !UUID_RE.test(targetId)) {
      throw new OverrideError(400, "commission overrides target a seller by uuid")
    }
    const rate = num(input.newValue, "commission_rate")
    if (rate < 0 || rate > 1) {
      throw new OverrideError(400, "commission_rate must be within [0, 1] — the store's CHECK refuses anything outside it")
    }
    const { rows } = await client.query(
      `SELECT id::text AS id, commission_rate::float AS rate, display_name
         FROM public.sellers
        WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE`,
      [targetId, tenantId],
    )
    const r = rows[0]
    if (!r) throw new OverrideError(404, "seller not found in this tenant")
    const before = { commission_rate: r.rate }
    const after = { commission_rate: rate }
    const overrideId = await insertRecord(client, input, {
      targetLabel: String(r.display_name), field: "commission_rate", before, after,
    })
    await client.query(
      `UPDATE public.sellers SET commission_rate = $1, updated_at = now()
        WHERE id = $2::uuid AND tenant_id = $3::uuid`,
      [rate, targetId, tenantId],
    )
    return { overrideId, field: "commission_rate", before, after, targetLabel: String(r.display_name), sellerId: targetId }
  }

  if (overrideType === "kpi") {
    if (input.targetType !== "seller" || !UUID_RE.test(targetId)) {
      throw new OverrideError(400, "KPI overrides target a seller by uuid")
    }
    const key = String(input.metricKey || "").trim()
    if (!key) throw new OverrideError(400, "metricKey is required for a KPI override")
    const value = num(input.newValue, "value")
    const { rows: sellerRows } = await client.query(
      `SELECT id::text AS id, display_name FROM public.sellers
        WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE`,
      [targetId, tenantId],
    )
    const seller = sellerRows[0]
    if (!seller) throw new OverrideError(404, "seller not found in this tenant")
    const { rows: defRows } = await client.query(
      `SELECT 1 FROM public.seller_metric_definitions WHERE tenant_id = $1::uuid AND key = $2
       UNION ALL
       SELECT 1 FROM public.seller_kpi_definitions WHERE tenant_id = $1::uuid AND key = $2
       LIMIT 1`,
      [tenantId, key],
    )
    if (defRows.length === 0) {
      throw new OverrideError(400, `unknown metric key '${key}' — it is not among the tenant's seeded KPI/metric definitions`)
    }
    const { rows: factRows } = await client.query(
      `SELECT value::float AS value FROM public.seller_metric_facts
        WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND metric_key = $3
        ORDER BY (dimension->>'source' = 'manual_override') DESC, measured_at DESC
        LIMIT 1`,
      [tenantId, targetId, key],
    )
    const before = factRows[0] ? { value: factRows[0].value } : null
    const after = { value }
    const overrideId = await insertRecord(client, input, {
      targetLabel: String(seller.display_name), field: `metric:${key}`, before, after,
    })
    await client.query(
      `INSERT INTO public.seller_metric_facts (tenant_id, seller_id, metric_key, value, dimension)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)`,
      [tenantId, targetId, key, value, JSON.stringify({ source: "manual_override", override_id: overrideId, reason: input.reason })],
    )
    return { overrideId, field: `metric:${key}`, before, after, targetLabel: String(seller.display_name), sellerId: targetId }
  }

  if (overrideType === "status") {
    return applyStatusInTx(client, input)
  }

  if (overrideType === "hold") {
    if (input.targetType !== "seller_payout" || !UUID_RE.test(targetId)) {
      throw new OverrideError(400, "hold overrides target a seller_payout by uuid")
    }
    const action = (input.newValue as any)?.action
    if (action !== "hold" && action !== "release") {
      throw new OverrideError(400, "hold overrides carry newValue.action of 'hold' or 'release'")
    }
    // The E1 desk's transition map (src/app/api/admin/payouts/route.ts) —
    // an override moves through the same states the desk allows.
    const map = { hold: { from: ["pending", "approved"], to: "on_hold" }, release: { from: ["on_hold"], to: "pending" } } as const
    const t = map[action as "hold" | "release"]
    const { rows } = await client.query(
      `SELECT id::text AS id, status, seller_id::text AS seller_id, amount::float AS amount
         FROM public.seller_payouts
        WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE`,
      [targetId, tenantId],
    )
    const r = rows[0]
    if (!r) throw new OverrideError(404, "payout not found in this tenant")
    if (!(t.from as readonly string[]).includes(String(r.status))) {
      throw new OverrideError(
        409,
        `cannot ${action} a payout in status '${r.status}' — the E1 transition allows ${action} only from ${t.from.join(" or ")}`,
      )
    }
    const before = { status: r.status }
    const after = { status: t.to, hold_action: action }
    const { rows: sellerRows } = await client.query(
      `SELECT display_name FROM public.sellers WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [r.seller_id, tenantId],
    )
    const label = sellerRows[0] ? `payout for ${sellerRows[0].display_name}` : "seller payout"
    const overrideId = await insertRecord(client, input, {
      targetLabel: label, field: "payout_status", before, after,
    })
    await client.query(
      `UPDATE public.seller_payouts SET status = $1, updated_at = now()
        WHERE id = $2::uuid AND tenant_id = $3::uuid`,
      [t.to, targetId, tenantId],
    )
    return { overrideId, field: "payout_status", before, after, targetLabel: label, sellerId: r.seller_id }
  }

  throw new OverrideError(400, `unknown override_type '${overrideType}'`)
}

async function applyStatusInTx(client: PgClientLike, input: ApplyOverrideInput): Promise<ApplyOverrideResult> {
  const { tenantId, targetId } = input

  if (input.targetType === "seller") {
    if (!UUID_RE.test(targetId)) throw new OverrideError(400, "seller target must be a uuid")
    const status = String(input.newValue || "")
    if (!(SELLER_STATUS_VOCAB as readonly string[]).includes(status)) {
      throw new OverrideError(400, `seller status must be one of ${SELLER_STATUS_VOCAB.join(", ")} — the store's CHECK vocabulary`)
    }
    const { rows } = await client.query(
      `SELECT id::text AS id, status, display_name FROM public.sellers
        WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE`,
      [targetId, tenantId],
    )
    const r = rows[0]
    if (!r) throw new OverrideError(404, "seller not found in this tenant")
    const before = { status: r.status }
    const after = { status }
    const overrideId = await insertRecord(client, input, {
      targetLabel: String(r.display_name), field: "status", before, after,
    })
    await client.query(
      `UPDATE public.sellers SET status = $1, updated_at = now()
        WHERE id = $2::uuid AND tenant_id = $3::uuid`,
      [status, targetId, tenantId],
    )
    return { overrideId, field: "status", before, after, targetLabel: String(r.display_name), sellerId: targetId }
  }

  if (input.targetType === "employee") {
    if (!UUID_RE.test(targetId)) throw new OverrideError(400, "staff target must be a uuid")
    if (typeof input.newValue !== "boolean") {
      throw new OverrideError(400, "a staff status override carries newValue as a boolean (is_active)")
    }
    const { rows } = await client.query(
      `SELECT id::text AS id, is_active, display_name, email FROM public.crm_staff
        WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE`,
      [targetId, tenantId],
    )
    const r = rows[0]
    if (!r) throw new OverrideError(404, "staff record not found in this tenant")
    const before = { is_active: Boolean(r.is_active) }
    const after = { is_active: input.newValue }
    const label = String(r.display_name || r.email || "Staff")
    const overrideId = await insertRecord(client, input, {
      targetLabel: label, field: "is_active", before, after,
    })
    await client.query(
      `UPDATE public.crm_staff SET is_active = $1 WHERE id = $2::uuid AND tenant_id = $3::uuid`,
      [input.newValue, targetId, tenantId],
    )
    return { overrideId, field: "is_active", before, after, targetLabel: label, sellerId: null }
  }

  if (input.targetType === "customer") {
    const status = String(input.newValue || "").trim()
    if (!status || status.length > 40) {
      throw new OverrideError(400, "customer status must be 1–40 characters (the field carries no database vocabulary)")
    }
    const platformTenantId = input.platformTenantId ?? tenantId
    const { rows } = await client.query(
      `SELECT id, "customerStatus" AS status, "firstName", "lastName", email FROM public.customers
        WHERE id = $1
          AND (tenant_id = $2::uuid OR (tenant_id IS NULL AND $2::uuid = $3::uuid))
        FOR UPDATE`,
      [targetId, tenantId, platformTenantId],
    )
    const r = rows[0]
    if (!r) throw new OverrideError(404, "customer not found in this tenant")
    const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim()
    const label = r.email ? `${name || "Customer"} <${r.email}>` : name || "Customer"
    const before = { customerStatus: r.status }
    const after = { customerStatus: status }
    const overrideId = await insertRecord(client, input, {
      targetLabel: label, field: "customerStatus", before, after,
    })
    await client.query(
      `UPDATE public.customers SET "customerStatus" = $1
        WHERE id = $2
          AND (tenant_id = $3::uuid OR (tenant_id IS NULL AND $3::uuid = $4::uuid))`,
      [status, targetId, tenantId, platformTenantId],
    )
    return { overrideId, field: "customerStatus", before, after, targetLabel: label, sellerId: null }
  }

  throw new OverrideError(400, `status overrides do not target '${input.targetType}'`)
}
