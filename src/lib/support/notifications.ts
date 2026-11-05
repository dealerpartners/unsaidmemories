// ============================================================================
// §12 NOTIFICATIONS — the single path into support_notifications
// (recipient · kind · channel in_app|email|push · ref · read_at), the one
// route for mentions, assignments, SLA warnings and escalations.
//
// Before B5 the table had exactly two writers, each hand-rolling the
// same INSERT — the engine's notify_staff action (actions.ts) and the
// escalation evaluator's notifyRecipients (escalation.ts) — and the
// assignment paths wrote nothing at all: a staffer could be assigned a
// ticket by the desk, by routing, by a macro/automation, or by an
// escalation reassign and never be told. Every write now goes through
// notifySupportStaff below, and every assignment path calls
// notifyAssignment. (§8's internal-note @mentions have no mechanism in
// the reply flow yet — no mention parser exists anywhere in src; when
// one lands it calls this same path with kind 'mention'.)
//
// Writers are FAIL-SOFT, the platform's notification pattern (the
// notify.ts email legs): a failed notification insert returns false
// and NEVER fails the ticket action that caused it.
//
// §10 PREFS (support-gaps build): support_notification_prefs —
// (tenant, staff, event_kind, channel) → enabled / digest — existed
// with delivery never reading it. notifySupportStaff now consults
// the recipient's row for the (kind, channel) being written BEFORE
// writing: enabled=false suppresses the write entirely; digest=true
// on an email/push write holds it as an in_app row instead (the
// store carries no digest-batch machinery, so the in-app inbox IS
// the digest surface — the row lands once, in the bell, rather than
// as an outbound message). No pref row = today's behavior, exactly.
// The prefs read is fail-soft like the write: a prefs failure falls
// back to delivering as requested, never to silence.
// (§8's mention parser has landed — mentions.ts calls this same path
// with kind 'mention', and prefs apply to mentions like everything
// else.)
//
// Reads are the shapes the employee Support surface established
// (api/employee/modules/support/notifications): a staffer reads ONLY
// their own rows — tenant + recipient predicated in every statement —
// and mark-read touches only their own rows.
// ============================================================================

import type { SupportDb } from "./engine-shared"

export type SupportNotificationChannel = "in_app" | "email" | "push"

export interface SupportNotificationInput {
  recipientStaffId: string
  kind: string
  channel?: SupportNotificationChannel
  ticketId?: string | null
  ref?: string | null
}

/**
 * §10 prefs consultation: given the (kind, channel) about to be
 * written, return the channel to actually write — or null to
 * suppress. Reads the recipient's support_notification_prefs rows
 * for this kind; absent rows mean "deliver as requested".
 */
async function channelPerPrefs(
  db: SupportDb,
  tenantId: string,
  staffId: string,
  kind: string,
  requested: SupportNotificationChannel,
): Promise<SupportNotificationChannel | null> {
  try {
    const { rows } = await db.query(
      `SELECT channel, enabled, digest FROM public.support_notification_prefs
        WHERE tenant_id = $1::uuid AND staff_id = $2::uuid AND event_kind = $3`,
      [tenantId, staffId, kind],
    )
    if (!rows.length) return requested
    const byChannel = new Map<string, { enabled: boolean; digest: boolean }>()
    for (const r of rows as any[]) {
      byChannel.set(r.channel, { enabled: r.enabled !== false, digest: r.digest === true })
    }
    const mine = byChannel.get(requested)
    if (mine && !mine.enabled) return null
    if (mine?.digest && requested !== "in_app") {
      // Digest holds outbound channels in the inbox; an explicit
      // in_app opt-out for the kind still wins.
      const inApp = byChannel.get("in_app")
      if (inApp && !inApp.enabled) return null
      return "in_app"
    }
    return requested
  } catch {
    return requested
  }
}

/** The one INSERT every staff notification in the platform goes through. */
export async function notifySupportStaff(
  db: SupportDb,
  tenantId: string,
  input: SupportNotificationInput,
): Promise<boolean> {
  if (!input.recipientStaffId) return false
  const channel = await channelPerPrefs(
    db, tenantId, input.recipientStaffId, input.kind, input.channel ?? "in_app",
  )
  if (channel === null) return false
  try {
    await db.query(
      `INSERT INTO public.support_notifications (tenant_id, recipient_staff_id, kind, channel, ticket_id, ref)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6)`,
      [
        tenantId, input.recipientStaffId, input.kind,
        channel, input.ticketId ?? null, input.ref ?? null,
      ],
    )
    return true
  } catch {
    return false
  }
}

/**
 * The assignment leg — one 'assigned' row for the new assignee, ref =
 * the human ticket reference. Called by every path that changes a
 * ticket's assignee: the desk PATCH, routing decisions, the engine's
 * assign_staff action, and escalation reassigns.
 */
export async function notifyAssignment(
  db: SupportDb,
  tenantId: string,
  ticket: { id: string; ticket_ref: string },
  staffId: string,
): Promise<boolean> {
  return notifySupportStaff(db, tenantId, {
    recipientStaffId: staffId,
    kind: "assigned",
    ticketId: ticket.id,
    ref: ticket.ticket_ref,
  })
}

export interface StaffNotification {
  id: string
  kind: string
  channel: string
  ticketId: string | null
  ticketRef: string | null
  ref: string | null
  readAt: string | null
  createdAt: string
}

/** A staffer's own inbox: newest first, with the unread count. */
export async function listStaffNotifications(
  db: SupportDb,
  tenantId: string,
  staffId: string,
  limit = 50,
): Promise<{ notifications: StaffNotification[]; unread: number }> {
  const capped = Math.min(100, Math.max(1, Math.floor(limit) || 50))
  const { rows } = await db.query(
    `SELECT n.id::text AS id, n.kind, n.channel, n.ticket_id::text AS ticket_id,
            t.ticket_ref, n.ref, n.read_at::text AS read_at, n.created_at::text AS created_at
       FROM public.support_notifications n
       LEFT JOIN public.support_tickets t ON t.id = n.ticket_id AND t.tenant_id = n.tenant_id
      WHERE n.tenant_id = $1::uuid AND n.recipient_staff_id = $2::uuid
      ORDER BY n.created_at DESC
      LIMIT $3`,
    [tenantId, staffId, capped],
  )
  const notifications: StaffNotification[] = rows.map((n: any) => ({
    id: n.id, kind: n.kind, channel: n.channel,
    ticketId: n.ticket_id ?? null, ticketRef: n.ticket_ref ?? null,
    ref: n.ref ?? null, readAt: n.read_at ?? null, createdAt: n.created_at,
  }))
  return { notifications, unread: notifications.filter((n) => !n.readAt).length }
}

/** Mark one of the staffer's own notifications read, or all of them. */
export async function markStaffNotificationsRead(
  db: SupportDb,
  tenantId: string,
  staffId: string,
  which: { id: string } | { all: true },
): Promise<number> {
  const { rows } = "all" in which
    ? await db.query(
        `UPDATE public.support_notifications
            SET read_at = now(), updated_at = now()
          WHERE tenant_id = $1::uuid AND recipient_staff_id = $2::uuid AND read_at IS NULL
          RETURNING id::text AS id`,
        [tenantId, staffId],
      )
    : await db.query(
        `UPDATE public.support_notifications
            SET read_at = now(), updated_at = now()
          WHERE tenant_id = $1::uuid AND recipient_staff_id = $2::uuid AND id = $3::uuid AND read_at IS NULL
          RETURNING id::text AS id`,
        [tenantId, staffId, which.id],
      )
  return rows.length
}
