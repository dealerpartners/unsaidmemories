// ============================================================================
// §8 RELATIONS AND COLLABORATION — the ticket's links and relations.
//
// The tree (§8) names two stores, both schema-live since the §20
// program and — until this module — written and read by NOTHING:
//
//   support_links — typed links from a ticket to the platform object
//     the case is about (order | payment | listing | seller |
//     appointment | prescription). One nullable FK per type; the live
//     CHECK (support_links_exactly_one_target) enforces exactly one
//     set, and link_type carries the same six values as the tree.
//   support_ticket_relations — ticket ↔ ticket relations in the
//     tree's own vocabulary (duplicate_of | related | child |
//     problem_incident — the live CHECK, migration 20261032, carries
//     exactly these four). Relations are NAVIGATIONAL (the
//     migration's word) — distinct from merged_into_id, which is the
//     destructive duplicate resolution on the ticket row itself.
//
// FK shape (pg_constraint, read live — do not "fix"): the ticket side
// binds compositely (tenant_id, ticket_id) → support_tickets; the
// related end is a PLAIN FK to support_tickets(id) by design (B2
// established this; the §18 gate suite rejected binding it). No
// tenant-match check exists: a relation row carries the SOURCE
// ticket's tenant and may point at another tenant's ticket — the
// cross-tenant case is designed (franchise ↔ master cases), and the
// schema's own CHECK (ticket_id <> related_ticket_id) is the only
// shape rule beyond the type vocabulary.
//
// Idempotency: relations carry a UNIQUE natural key (ticket, related,
// type) — a repeat create returns the existing row. Links carry no
// unique constraint, so the writer checks the natural key (tenant,
// ticket, type, target) first and likewise returns the existing row:
// a link lands exactly once either way.
//
// Events ride the append-only spine in its existing vocabulary:
// 'child' relation creates log 'child_linked' (the tree's own §4
// type); everything else rides 'system' with detail.kind —
// link_added | link_removed | relation_added | relation_removed —
// the B3/B4 pattern. No event types are invented.
//
// Exposure (§16): these are staff-side records. Requester surfaces
// never read this module; link targets resolve tenant-predicated, so
// a link can only point at the ticket's own tenant's objects and a
// label never leaks across tenants.
// ============================================================================

import { logTicketEvent } from "./tickets"

export const LINK_TYPES = [
  "order", "payment", "listing", "seller", "appointment", "prescription",
] as const
export type SupportLinkType = (typeof LINK_TYPES)[number]

export const RELATION_TYPES = [
  "duplicate_of", "related", "child", "problem_incident",
] as const
export type SupportRelationType = (typeof RELATION_TYPES)[number]

export class RelationsError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface SupportActor {
  staffId: string | null
  name: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Per-type target: the link column, the target table, whether its id
// is a uuid (commerce_orders.id is TEXT), and the label projection.
// Every target table carries tenant_id; existence + label reads are
// tenant-predicated so a link never reaches across tenants.
const LINK_TARGETS: Record<SupportLinkType, {
  column: string
  table: string
  uuid: boolean
  label: string // SQL expression over alias t producing the display label
  extra: string // SQL expression over alias t producing a status/detail suffix
}> = {
  order: {
    column: "order_id", table: "commerce_orders", uuid: false,
    label: `'Order ' || t.id`, extra: `t.status || ' · ' || t.total_amount`, // total_amount is TEXT stored with its $ sign
  },
  payment: {
    column: "payment_id", table: "commerce_payments", uuid: true,
    label: `'Payment ' || COALESCE(t.payment_number, t.id::text)`, extra: `t.status || ' · $' || t.amount`,
  },
  listing: {
    column: "listing_id", table: "seller_listings", uuid: true,
    label: `COALESCE(t.title, 'Listing ' || t.id::text)`, extra: `t.status`,
  },
  seller: {
    column: "seller_id", table: "sellers", uuid: true,
    label: `COALESCE(t.display_name, t.legal_name, 'Seller ' || t.id::text)`, extra: `t.status`,
  },
  appointment: {
    column: "appointment_id", table: "crm_appointments", uuid: true,
    label: `'Appointment ' || COALESCE(t.appointment_number, t.id::text)`, extra: `t.status`,
  },
  prescription: {
    column: "prescription_id", table: "prescriptions", uuid: true,
    label: `COALESCE(t.medication_name, 'Prescription ' || t.id::text)`, extra: `t.status`,
  },
}

const LINK_COLS = `
  id::text AS id, link_type, order_id, payment_id::text AS payment_id,
  listing_id::text AS listing_id, seller_id::text AS seller_id,
  appointment_id::text AS appointment_id, prescription_id::text AS prescription_id,
  created_by_staff_id::text AS created_by_staff_id, created_at::text AS created_at`

function linkTargetId(row: any): string | null {
  return row.order_id ?? row.payment_id ?? row.listing_id ?? row.seller_id
    ?? row.appointment_id ?? row.prescription_id ?? null
}

async function resolveTarget(
  client: any, tenant: string, linkType: SupportLinkType, targetId: string,
): Promise<{ label: string; detail: string } | null> {
  const spec = LINK_TARGETS[linkType]
  const cast = spec.uuid ? "$1::uuid" : "$1"
  const r = await client.query(
    `SELECT ${spec.label} AS label, ${spec.extra} AS detail
       FROM public.${spec.table} t
      WHERE t.id = ${cast} AND t.tenant_id = $2::uuid
      LIMIT 1`,
    [targetId, tenant],
  ).catch(() => ({ rows: [] as any[] }))
  return r.rows[0] ?? null
}

function mapLink(row: any, target: { label: string; detail: string } | null) {
  return {
    id: row.id,
    linkType: row.link_type as SupportLinkType,
    targetId: linkTargetId(row),
    targetLabel: target?.label ?? null,
    targetDetail: target?.detail ?? null,
    createdByStaffId: row.created_by_staff_id ?? null,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
  }
}

export type SupportLinkRow = ReturnType<typeof mapLink>

/** Every typed link on the ticket, labels resolved live. */
export async function listLinks(
  client: any, tenant: string, ticketId: string,
): Promise<SupportLinkRow[]> {
  const r = await client.query(
    `SELECT ${LINK_COLS}, s.display_name AS created_by_name
       FROM public.support_links l
       LEFT JOIN public.crm_staff s ON s.id = l.created_by_staff_id
      WHERE l.tenant_id = $1::uuid AND l.ticket_id = $2::uuid
      ORDER BY l.created_at ASC`,
    [tenant, ticketId],
  )
  const out: SupportLinkRow[] = []
  for (const row of r.rows) {
    const targetId = linkTargetId(row)
    const target = targetId ? await resolveTarget(client, tenant, row.link_type, targetId) : null
    out.push(mapLink(row, target))
  }
  return out
}

/**
 * Link the ticket to a platform object. The target must exist in the
 * ticket's own tenant — a link to nothing (or to another tenant's
 * object) is refused by name. Repeat creates return the existing row.
 */
export async function createLink(
  client: any, tenant: string, ticketId: string,
  input: { linkType: unknown; targetId: unknown },
  actor: SupportActor,
): Promise<{ link: SupportLinkRow; created: boolean }> {
  const linkType = String(input.linkType ?? "") as SupportLinkType
  if (!LINK_TYPES.includes(linkType)) {
    throw new RelationsError(400, `Unknown link type "${String(input.linkType ?? "")}" — expected one of ${LINK_TYPES.join(", ")}`)
  }
  const targetId = String(input.targetId ?? "").trim()
  if (!targetId) throw new RelationsError(400, "targetId is required")
  const spec = LINK_TARGETS[linkType]
  if (spec.uuid && !UUID_RE.test(targetId)) {
    throw new RelationsError(400, `"${targetId}" is not a valid ${linkType} id`)
  }
  const target = await resolveTarget(client, tenant, linkType, targetId)
  if (!target) {
    throw new RelationsError(404, `No ${linkType} with id ${targetId} exists in this tenant`)
  }
  const existing = await client.query(
    `SELECT ${LINK_COLS} FROM public.support_links
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND link_type = $3
        AND ${spec.column} = ${spec.uuid ? "$4::uuid" : "$4"}
      LIMIT 1`,
    [tenant, ticketId, linkType, targetId],
  )
  if (existing.rows[0]) return { link: mapLink(existing.rows[0], target), created: false }
  const ins = await client.query(
    `INSERT INTO public.support_links
       (tenant_id, ticket_id, link_type, ${spec.column}, created_by_staff_id)
     VALUES ($1::uuid, $2::uuid, $3, ${spec.uuid ? "$4::uuid" : "$4"}, $5::uuid)
     RETURNING ${LINK_COLS}`,
    [tenant, ticketId, linkType, targetId, actor.staffId],
  )
  const link = mapLink(ins.rows[0], target)
  await logTicketEvent(client, tenant, ticketId, {
    type: "system",
    actorStaffId: actor.staffId, actorLabel: actor.name,
    detail: { kind: "link_added", linkId: link.id, linkType, targetId, targetLabel: target.label },
  }).catch(() => {})
  return { link, created: true }
}

/** Remove a link from the ticket. The row is deleted; the removal is on the event trail. */
export async function deleteLink(
  client: any, tenant: string, ticketId: string, linkId: string,
  actor: SupportActor,
): Promise<{ id: string; linkType: string; targetId: string | null }> {
  if (!UUID_RE.test(linkId)) throw new RelationsError(400, "Invalid link id")
  const del = await client.query(
    `DELETE FROM public.support_links
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND id = $3::uuid
      RETURNING ${LINK_COLS}`,
    [tenant, ticketId, linkId],
  )
  if (!del.rows[0]) throw new RelationsError(404, "Link not found on this ticket")
  const row = del.rows[0]
  await logTicketEvent(client, tenant, ticketId, {
    type: "system",
    actorStaffId: actor.staffId, actorLabel: actor.name,
    detail: { kind: "link_removed", linkId, linkType: row.link_type, targetId: linkTargetId(row) },
  }).catch(() => {})
  return { id: row.id, linkType: row.link_type, targetId: linkTargetId(row) }
}

const RELATION_COLS = `
  id::text AS id, relation_type, created_at::text AS created_at`

function mapRelation(row: any, direction: "outgoing" | "incoming") {
  return {
    id: row.id,
    relationType: row.relation_type as SupportRelationType,
    direction,
    otherTicketId: row.other_id,
    otherRef: row.other_ref ?? null,
    otherSubject: row.other_subject ?? null,
    otherStatus: row.other_status ?? null,
    createdAt: row.created_at,
  }
}

export type SupportRelationRow = ReturnType<typeof mapRelation>

/**
 * Every relation touching the ticket, both directions, as stored —
 * the type and direction are the fact; nothing is inverted or
 * re-interpreted for display. Incoming rows carry the SOURCE
 * ticket's tenant (possibly another tenant — cross-tenant relations
 * are designed), so the incoming read keys on the viewed ticket
 * alone; the route has already tenant-verified that ticket.
 */
export async function listRelations(
  client: any, tenant: string, ticketId: string,
): Promise<SupportRelationRow[]> {
  const out = await client.query(
    `SELECT ${RELATION_COLS}, t.id::text AS other_id, t.ticket_ref AS other_ref,
            t.subject AS other_subject, t.status AS other_status
       FROM public.support_ticket_relations r
       JOIN public.support_tickets t ON t.id = r.related_ticket_id
      WHERE r.tenant_id = $1::uuid AND r.ticket_id = $2::uuid
      ORDER BY r.created_at ASC`,
    [tenant, ticketId],
  )
  const inc = await client.query(
    `SELECT ${RELATION_COLS}, t.id::text AS other_id, t.ticket_ref AS other_ref,
            t.subject AS other_subject, t.status AS other_status
       FROM public.support_ticket_relations r
       JOIN public.support_tickets t ON t.id = r.ticket_id
      WHERE r.related_ticket_id = $1::uuid
      ORDER BY r.created_at ASC`,
    [ticketId],
  )
  return [
    ...out.rows.map((r: any) => mapRelation(r, "outgoing")),
    ...inc.rows.map((r: any) => mapRelation(r, "incoming")),
  ]
}

/**
 * Relate this ticket to another. The related ticket may belong to
 * another tenant (the related end is a plain FK by design — the
 * franchise ↔ master case); the row itself carries this ticket's
 * tenant. A ref resolves within this tenant (refs are per-tenant);
 * cross-tenant targets are addressed by id. Repeat creates return
 * the existing row (the UNIQUE natural key is the backstop); for
 * the symmetric 'related', the flipped direction is the same fact
 * and also returns existing.
 */
export async function createRelation(
  client: any, tenant: string, ticketId: string,
  input: { relatedTicketId?: unknown; relatedTicketRef?: unknown; relationType: unknown },
  actor: SupportActor,
): Promise<{ relation: SupportRelationRow; created: boolean }> {
  const relationType = String(input.relationType ?? "") as SupportRelationType
  if (!RELATION_TYPES.includes(relationType)) {
    throw new RelationsError(400, `Unknown relation type "${String(input.relationType ?? "")}" — expected one of ${RELATION_TYPES.join(", ")}`)
  }
  let related: any = null
  const relatedId = String(input.relatedTicketId ?? "").trim()
  const relatedRef = String(input.relatedTicketRef ?? "").trim()
  if (relatedId) {
    if (!UUID_RE.test(relatedId)) throw new RelationsError(400, `"${relatedId}" is not a valid ticket id`)
    const r = await client.query(
      `SELECT id::text AS id, tenant_id::text AS tenant_id, ticket_ref, subject, status
         FROM public.support_tickets WHERE id = $1::uuid LIMIT 1`,
      [relatedId],
    )
    related = r.rows[0] ?? null
    if (!related) throw new RelationsError(404, `No ticket with id ${relatedId} exists`)
  } else if (relatedRef) {
    const r = await client.query(
      `SELECT id::text AS id, tenant_id::text AS tenant_id, ticket_ref, subject, status
         FROM public.support_tickets
        WHERE tenant_id = $1::uuid AND ticket_ref = $2 LIMIT 1`,
      [tenant, relatedRef],
    )
    related = r.rows[0] ?? null
    if (!related) throw new RelationsError(404, `No ticket ${relatedRef} exists in this tenant`)
  } else {
    throw new RelationsError(400, "relatedTicketId or relatedTicketRef is required")
  }
  if (related.id === ticketId) {
    throw new RelationsError(400, "A ticket cannot be related to itself")
  }
  const findExisting = async (fromId: string, toId: string) => {
    const r = await client.query(
      `SELECT ${RELATION_COLS} FROM public.support_ticket_relations
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
          AND related_ticket_id = $3::uuid AND relation_type = $4
        LIMIT 1`,
      [tenant, fromId, toId, relationType],
    )
    return r.rows[0] ?? null
  }
  const existing = await findExisting(ticketId, related.id)
  if (existing) {
    return {
      relation: mapRelation({ ...existing, other_id: related.id, other_ref: related.ticket_ref, other_subject: related.subject, other_status: related.status }, "outgoing"),
      created: false,
    }
  }
  if (relationType === "related") {
    const flipped = await findExisting(related.id, ticketId)
    if (flipped) {
      return {
        relation: mapRelation({ ...flipped, other_id: related.id, other_ref: related.ticket_ref, other_subject: related.subject, other_status: related.status }, "incoming"),
        created: false,
      }
    }
  }
  let ins: any
  try {
    ins = await client.query(
      `INSERT INTO public.support_ticket_relations
         (tenant_id, ticket_id, related_ticket_id, relation_type)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
       RETURNING ${RELATION_COLS}`,
      [tenant, ticketId, related.id, relationType],
    )
  } catch (e: any) {
    if (e?.code === "23505") {
      const again = await findExisting(ticketId, related.id)
      if (again) {
        return {
          relation: mapRelation({ ...again, other_id: related.id, other_ref: related.ticket_ref, other_subject: related.subject, other_status: related.status }, "outgoing"),
          created: false,
        }
      }
    }
    throw e
  }
  const relation = mapRelation(
    { ...ins.rows[0], other_id: related.id, other_ref: related.ticket_ref, other_subject: related.subject, other_status: related.status },
    "outgoing",
  )
  const isChildLink = relationType === "child"
  await logTicketEvent(client, tenant, ticketId, {
    type: isChildLink ? "child_linked" : "system",
    actorStaffId: actor.staffId, actorLabel: actor.name,
    detail: isChildLink
      ? { relationId: relation.id, relationType, relatedTicketId: related.id, relatedRef: related.ticket_ref }
      : { kind: "relation_added", relationId: relation.id, relationType, relatedTicketId: related.id, relatedRef: related.ticket_ref },
  }).catch(() => {})
  return { relation, created: true }
}

/**
 * Remove a relation shown on this ticket (either direction — the
 * agent looking at the ticket can sever what the ticket shows,
 * including an incoming cross-tenant relation whose row carries the
 * source ticket's tenant; the touch predicate is the guard, and the
 * route has already tenant-verified the viewed ticket). The removal
 * is recorded on this ticket's trail.
 */
export async function deleteRelation(
  client: any, tenant: string, ticketId: string, relationId: string,
  actor: SupportActor,
): Promise<{ id: string; relationType: string }> {
  if (!UUID_RE.test(relationId)) throw new RelationsError(400, "Invalid relation id")
  const del = await client.query(
    `DELETE FROM public.support_ticket_relations
      WHERE id = $1::uuid
        AND (ticket_id = $2::uuid OR related_ticket_id = $2::uuid)
      RETURNING ${RELATION_COLS}, ticket_id::text AS from_id, related_ticket_id::text AS to_id`,
    [relationId, ticketId],
  )
  if (!del.rows[0]) throw new RelationsError(404, "Relation not found on this ticket")
  const row = del.rows[0]
  await logTicketEvent(client, tenant, ticketId, {
    type: "system",
    actorStaffId: actor.staffId, actorLabel: actor.name,
    detail: {
      kind: "relation_removed", relationId, relationType: row.relation_type,
      relatedTicketId: row.from_id === ticketId ? row.to_id : row.from_id,
    },
  }).catch(() => {})
  return { id: row.id, relationType: row.relation_type }
}
