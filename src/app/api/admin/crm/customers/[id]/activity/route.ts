import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/crm/customers/[id]/activity?crm_id=
//   [id] = the shop customer id (the id the profile view carries);
//   ?crm_id= is the optional known CRM link.
//
//   The profile's Notes & Activity feed, merged from REAL sources only:
//     - public.crm_notes                      → source 'note'
//     - public.crm_appointment_status_history → source 'activity'
//       (transitions on this customer's appointments)
//     - public.crm_audit_log                  → source 'audit'
//       (rows whose entity is this CRM customer)
//   Nothing is synthesized: a customer with no records gets an honest
//   empty list. Identity resolution mirrors the sibling payments route:
//   the CRM record is found via ?crm_id=, a direct id match,
//   source_customer_id, or the shop customer's own email — stored keys
//   only, never name matching.

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || "");

const NOTE_TYPE_LABELS: Record<string, string> = {
  internal: "Internal Note",
  customer_visible: "Customer Note",
  appointment: "Appointment Note",
  pet_handling: "Pet Handling Note",
  system: "System",
};

type ActivityRow = {
  id: string;
  source: "note" | "activity" | "audit";
  timestamp: string; // ISO
  actor: string;
  actorType: "Staff" | "System";
  description: string;
  isPinned: boolean;
  noteType: string | null;
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("customers", "read");
  if (gate) return gate;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "customer id required" }, { status: 400 });
  const crmIdParam = req.nextUrl.searchParams.get("crm_id") || "";

  const result = await withPg(async (c) => {
    const tenant = resolveTenantId(req);
    const rows: ActivityRow[] = [];

    // ---- Resolve the CRM customer id (stored keys only) ----------------
    let crmId: string | null = isUuid(crmIdParam) ? crmIdParam : isUuid(id) ? id : null;
    if (!crmId || crmId === id) {
      let shopEmail = "";
      try {
        const shop = await c.query(
          `SELECT email FROM public.customers WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [id, tenant],
        );
        shopEmail = String((shop.rows[0] as any)?.email || "");
      } catch { /* CRM resolution below still applies */ }
      try {
        const link = await c.query(
          `SELECT id::text AS id FROM public.crm_customers
            WHERE tenant_id = $1
              AND (id::text = $2 OR source_customer_id = $2
                   OR ($3 <> '' AND lower(email) = lower($3)))
            LIMIT 1`,
          [tenant, isUuid(crmIdParam) ? crmIdParam : id, shopEmail],
        );
        if ((link.rows[0] as any)?.id) crmId = String((link.rows[0] as any).id);
      } catch { /* keep the seed id */ }
    }
    if (!crmId || !isUuid(crmId)) {
      return NextResponse.json({ data: [], total: 0 });
    }

    // ---- 1) Notes -------------------------------------------------------
    try {
      const notes = await c.query(
        `SELECT id::text AS id, note_type, body, is_pinned, created_at
           FROM public.crm_notes
          WHERE tenant_id = $1 AND customer_id = $2::uuid
          ORDER BY created_at DESC
          LIMIT 200`,
        [tenant, crmId],
      );
      for (const r of notes.rows as any[]) {
        const isSystem = r.note_type === "system";
        rows.push({
          id: `note-${r.id}`,
          source: "note",
          timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date(0).toISOString(),
          actor: NOTE_TYPE_LABELS[String(r.note_type || "")] || "Note",
          actorType: isSystem ? "System" : "Staff",
          description: String(r.body || ""),
          isPinned: !!r.is_pinned,
          noteType: r.note_type || null,
        });
      }
    } catch { /* other sources still return */ }

    // ---- 2) Appointment status history ---------------------------------
    try {
      const hist = await c.query(
        `SELECT h.id::text AS id, h.from_status, h.to_status, h.reason,
                h.changed_by, h.changed_at, a.appointment_number
           FROM public.crm_appointment_status_history h
           JOIN public.crm_appointments a
             ON a.id = h.appointment_id AND a.tenant_id = h.tenant_id
          WHERE h.tenant_id = $1 AND a.customer_id = $2::uuid
          ORDER BY h.changed_at DESC
          LIMIT 200`,
        [tenant, crmId],
      );
      for (const r of hist.rows as any[]) {
        const label = r.appointment_number ? `Appointment ${r.appointment_number}` : "Appointment";
        const transition = r.from_status
          ? `${r.from_status} → ${r.to_status}`
          : `status set to ${r.to_status}`;
        rows.push({
          id: `hist-${r.id}`,
          source: "activity",
          timestamp: r.changed_at ? new Date(r.changed_at).toISOString() : new Date(0).toISOString(),
          actor: r.changed_by ? "Staff" : "System",
          actorType: r.changed_by ? "Staff" : "System",
          description: `${label}: ${transition}${r.reason ? ` (${r.reason})` : ""}`,
          isPinned: false,
          noteType: null,
        });
      }
    } catch { /* other sources still return */ }

    // ---- 3) Audit log entries for this customer -------------------------
    try {
      const audit = await c.query(
        `SELECT id::text AS id, action, after_data, occurred_at
           FROM public.crm_audit_log
          WHERE tenant_id = $1 AND entity_type = 'crm_customers' AND entity_id = $2::uuid
          ORDER BY occurred_at DESC
          LIMIT 200`,
        [tenant, crmId],
      );
      for (const r of audit.rows as any[]) {
        rows.push({
          id: `audit-${r.id}`,
          source: "audit",
          timestamp: r.occurred_at ? new Date(r.occurred_at).toISOString() : new Date(0).toISOString(),
          actor: "System",
          actorType: "System",
          description: String(r.action || "Record updated"),
          isPinned: false,
          noteType: null,
        });
      }
    } catch { /* other sources still return */ }

    rows.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0;
    });
    return NextResponse.json({ data: rows, total: rows.length });
  });

  return result ?? NextResponse.json({ data: [], total: 0 });
}
