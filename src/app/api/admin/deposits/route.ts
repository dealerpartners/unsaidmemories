import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { repo } from "@/lib/repo";

import pg from "pg";
import { pgConnectionString, toTransactionPooler } from "@/lib/pg";
// Caller-scoped tenant resolution (bound selection → session home
// tenant → master), like every sibling admin route — NOT the env-only
// platform resolver in lib/tenant-id: a franchise tenant admin must see
// THEIR deposits registry, not headquarters' (2026-10-25 walk).
import { resolveTenantId } from "@/lib/admin-api";

// GET /api/admin/deposits
//
// Deposits & Escrow, live — sourced ONLY from the owner's tables:
//   commerce_deposits — the escrow registry (money actually collected:
//   held/applied/released/forfeited/refunded), payment_id -> commerce_payments
//   commerce_payments (status pending, PAY-<bookingId8>) — deposits whose
//   checkout started but money hasn't cleared yet → shown as PENDING.
// The booking reference rides in `notes` (JSON) and joins back to bookings
// for pet/service/appt; the ledger row provides the auth code.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("deposits", "read");
  if (gate) return gate;


  // ?audit=1 — recent deposit-related audit events from acct_audit_log (real, no fakes)
  if (req.nextUrl.searchParams.get("audit") === "1") {
    try {
      const cs = toTransactionPooler(process.env.SUPABASE_SESSION_POOLER || process.env.SUPABASE_DIRECT_CONNECTION || pgConnectionString);
      if (!cs) return NextResponse.json({ audit: [] });
      const TENANT_ID = resolveTenantId(req);
      const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
      await client.connect();
      try {
        const res = await client.query(
          `SELECT id::text, event_time::text AS created_at, action, table_name, record_id,
                  after_data::text AS after_data
             FROM public.acct_audit_log
            WHERE tenant_id = $1 AND table_name = 'commerce_deposits'
            ORDER BY event_time DESC LIMIT 20`,
          [TENANT_ID],
        );
        const audit = res.rows.map((r: any) => {
          let detail = "";
          try {
            const ad = JSON.parse(r.after_data || "{}");
            detail = [r.record_id, ad.amount != null ? `$${Number(ad.amount).toFixed(2)}` : "", ad.status || ""].filter(Boolean).join(" — ");
          } catch { /* ignore */ }
          return {
            id: r.id,
            timestamp: r.created_at,
            action: String(r.action || "").replace(/^fin_/, "").toUpperCase(),
            details: detail || r.record_id || r.action,
          };
        });
        return NextResponse.json({ audit });
      } finally {
        await client.end().catch(() => {});
      }
    } catch (e: any) {
      console.error("[GET /api/admin/deposits?audit=1]", e);
      return NextResponse.json({ error: e?.message || "Failed to load deposit audit events" }, { status: 500 });
    }
  }

  try {
    const [customers] = await Promise.all([
      repo.list("customers"),
    ]);
    // There is no bookings table in this schema — the booking join
    // below always missed. The map stays empty so deposit rows render
    // from the ledger + notes alone (removed fetch 2026-11-02).
    const bookingMap = new Map<string, any>();
    const customerMap = new Map((customers as any[]).map((c: any) => [c.id, c]));

    const rows: any[] = [];
    // Booking ids already represented in the escrow registry (so the pending
    // section never double-counts a collected deposit).
    const registryBookingIds = new Set<string>();

    const cs = toTransactionPooler(process.env.SUPABASE_SESSION_POOLER || process.env.SUPABASE_DIRECT_CONNECTION || pgConnectionString);
    if (cs) {
      const TENANT_ID = resolveTenantId(req);
      const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
      await client.connect();
      try {
        const res = await client.query(
          `SELECT cd.id::text, cd.deposit_number, cd.customer_id::text, cd.amount, cd.currency,
                  cd.collected_at, cd.method, cd.status, cd.notes, cd.deposit_type,
                  cc.first_name, cc.last_name, cc.email, cc.phone,
                  cp.processor_transaction_id AS pi_id, cp.status AS payment_status
           FROM public.commerce_deposits cd
           LEFT JOIN public.crm_customers cc ON cd.customer_id = cc.id
           LEFT JOIN public.commerce_payments cp ON cd.payment_id = cp.id
           WHERE cd.tenant_id = $1
           ORDER BY cd.collected_at DESC NULLS LAST;`,
          [TENANT_ID],
        );
        for (const r of res.rows) {
          let notes: any = {};
          try { notes = JSON.parse(r.notes || "{}"); } catch { /* plain-text notes */ }
          if (notes.bookingId) registryBookingIds.add(String(notes.bookingId));
          const b = notes.bookingId ? bookingMap.get(String(notes.bookingId)) : null;
          const amount = parseFloat(String(r.amount || "0")) || 0;
          rows.push({
            id: r.deposit_number || r.id,
            uuid: r.id,
            bookingId: notes.bookingId || null,
            customerId: r.customer_id || null,
            customer: `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email || "—",
            phone: r.phone || b?.phone || customerMap.get(String(r.customer_id))?.phone || "—",
            pet: notes.dogName || b?.dogName || "—",
            breed: b?.breed || "—",
            service: notes.service || b?.service || "Grooming deposit",
            amount,
            collectedDate: r.collected_at ? new Date(r.collected_at).toISOString().slice(0, 10) : "",
            collectedTime: r.collected_at ? new Date(r.collected_at).toISOString().slice(11, 19) + " UTC" : "",
            targetApptDate: b?.date || "",
            targetApptTime: b?.time ? `${b.time}${b?.status ? " // " + String(b.status).toUpperCase() : ""}` : "",
            method: r.method === "card" ? "CARD (STRIPE)" : String(r.method || "—").toUpperCase(),
            auth: r.pi_id ? `PI: ${String(r.pi_id).slice(0, 14)}…` : "—",
            status: String(r.status || "held").toUpperCase(),
            depositType: r.deposit_type || "booking",
            locationId: null as string | null,
          });
        }

        // Pending deposits: ledger rows whose checkout started but money
        // hasn't cleared (status pending). Matched to their booking by the
        // deterministic PAY-<bookingId8> number.
        const pending = await client.query(
          `SELECT cp.payment_number, cp.amount, cp.created_at, cp.external_reference,
                  cc.first_name, cc.last_name, cc.email, cc.phone
           FROM public.commerce_payments cp
           LEFT JOIN public.crm_customers cc ON cp.customer_id = cc.id
           WHERE cp.tenant_id = $1 AND cp.status = 'pending'
           ORDER BY cp.created_at DESC`,
          [TENANT_ID],
        );
        for (const r of pending.rows) {
          const prefix = String(r.payment_number || "").replace(/^PAY-/, "");
          const b = [...bookingMap.values()].find((x: any) => String(x.id || "").toUpperCase().startsWith(prefix));
          if (!b || registryBookingIds.has(String(b.id))) continue; // order payments / already collected
          const amount = parseFloat(String(r.amount || "0")) || 0;
          rows.push({
            id: r.payment_number,
            uuid: null,
            bookingId: b.id,
            customerId: null,
            customer: `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email || b.ownerName || "—",
            phone: r.phone || b.phone || "—",
            pet: b.dogName || "—",
            breed: b.breed || "—",
            service: b.service || "Grooming deposit",
            amount,
            collectedDate: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "",
            collectedTime: r.created_at ? new Date(r.created_at).toISOString().slice(11, 19) + " UTC" : "",
            targetApptDate: b.date || "",
            targetApptTime: b.time ? `${b.time}${b.status ? " // " + String(b.status).toUpperCase() : ""}` : "",
            method: "CARD (STRIPE)",
            auth: "PENDING",
            status: "PENDING",
            depositType: "booking",
            locationId: null as string | null,
          });
        }
      } finally {
        await client.end().catch(() => {});
      }
    }

    rows.sort((a, b) => (a.collectedDate < b.collectedDate ? 1 : -1));
    return NextResponse.json({ deposits: rows });
  } catch (e: any) {
    console.error("[GET /api/admin/deposits]", e);
    return NextResponse.json({ error: e.message || "Failed to load deposits" }, { status: 500 });
  }
}
