import { guard, ctx, ok, fail, body } from "../_shared";
import { round2, nextNumber, bookContext, attachCustomerNames } from "@/lib/accounting";

export const dynamic = "force-dynamic";

// GET /api/admin/accounting/recurring
//
// Recurring Billing payload (Batch 2): the schedules
// (acct_recurring_invoices with CRM names), a 30-day realization
// projection computed by stepping each ACTIVE schedule's next
// run date forward by its frequency (weekly/monthly/quarterly/
// yearly × interval_count) and counting the occurrences that
// land in the window — a projection from real schedules, not a
// promise — the billing calendar (those same occurrences), and
// the dunning list: open AR invoices past their due date with
// their reminder history (acct_ar_invoices.reminder_count /
// last_reminder_at), which is what a dunning engine works from.

function stepDate(d: Date, frequency: string, interval: number): Date {
  const out = new Date(d);
  const n = Math.max(1, interval || 1);
  if (frequency === "weekly") out.setDate(out.getDate() + 7 * n);
  else if (frequency === "quarterly") out.setMonth(out.getMonth() + 3 * n);
  else if (frequency === "yearly" || frequency === "annual") out.setFullYear(out.getFullYear() + n);
  else out.setMonth(out.getMonth() + n); // monthly + anything else
  return out;
}

export async function GET() {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const { data: templates } = await db.from("acct_recurring_invoices").select("*")
      .eq("tenant_id", tenant).order("next_run_date", { ascending: true }).limit(300);
    const schedules = await attachCustomerNames(db, templates);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + 30);
    type Occ = { date: string; scheduleId: string; templateNumber: string; customer: string; amount: number };
    const occurrences: Occ[] = [];
    const custNameOf = (r: any): string => {
      const c = r.crm_customers;
      if (!c) return "—";
      if (c.company_name) return c.company_name;
      return [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
    };
    for (const t of schedules as any[]) {
      if (t.status !== "active") continue;
      let cursor = t.next_run_date || t.next_run_on ? new Date(t.next_run_date || t.next_run_on) : null;
      if (!cursor || isNaN(cursor.getTime())) continue;
      let guard = 0;
      while (cursor <= horizon && guard++ < 40) {
        if (cursor >= today) {
          occurrences.push({
            date: cursor.toISOString().slice(0, 10), scheduleId: t.id,
            templateNumber: t.template_number, customer: custNameOf(t),
            amount: Number(t.total || 0),
          });
        }
        cursor = stepDate(cursor, String(t.frequency || "monthly"), Number(t.interval_count || 1));
      }
    }
    occurrences.sort((a, b) => a.date.localeCompare(b.date));
    const projected30 = round2(occurrences.reduce((s, o) => s + o.amount, 0));
    const weeks = [0, 0, 0, 0, 0];
    for (const o of occurrences) {
      const days = Math.floor((new Date(o.date).getTime() - today.getTime()) / 86400000);
      weeks[Math.min(4, Math.floor(days / 7))] += o.amount;
    }

    const { data: overdue } = await db.from("acct_ar_invoices")
      .select("id, invoice_number, customer_id, due_date, total, amount_paid, amount_credited, deposit_paid, status, reminder_count, last_reminder_at")
      .eq("tenant_id", tenant)
      .in("status", ["sent", "posted", "approved", "partially_paid"])
      .lt("due_date", today.toISOString().slice(0, 10))
      .order("due_date", { ascending: true }).limit(200);
    const dunningRows = await attachCustomerNames(db, overdue);
    const dunning = (dunningRows as any[])
      .map((i) => ({
        id: i.id, invoiceNumber: i.invoice_number, customer: custNameOf(i),
        dueDate: i.due_date,
        daysOverdue: Math.max(0, Math.floor((today.getTime() - new Date(i.due_date).getTime()) / 86400000)),
        balance: round2(Number(i.total || 0) - Number(i.amount_paid || 0) - Number(i.amount_credited || 0) - Number(i.deposit_paid || 0)),
        reminderCount: Number(i.reminder_count || 0),
        lastReminderAt: i.last_reminder_at,
      }))
      .filter((i) => i.balance > 0);

    const missedRuns = (schedules as any[]).filter((t) => {
      if (t.status !== "active") return false;
      const nr = t.next_run_date || t.next_run_on;
      return nr && new Date(nr) < today;
    }).length;

    return ok({
      schedules, occurrences, projected30,
      weeklyProjection: weeks.map((w) => round2(w)),
      dunning, missedRuns,
      summary: {
        active: (schedules as any[]).filter((t) => t.status === "active").length,
        paused: (schedules as any[]).filter((t) => t.status === "paused").length,
        ended: (schedules as any[]).filter((t) => t.status === "ended").length,
      },
    });
  } catch (e) { return fail(e, 500); }
}

export async function POST(req: Request) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    const { entityId } = await bookContext(db, tenant);
    const lines = (b.lines || []).map((l: any) => ({
      description: l.description, quantity: Number(l.quantity) || 1, unit_price: Number(l.unit_price) || 0,
      line_subtotal: round2((Number(l.quantity) || 1) * (Number(l.unit_price) || 0)),
    }));
    if (!lines.length) throw new Error("Template needs at least one line");
    const subtotal = round2(lines.reduce((s: number, l: any) => s + l.line_subtotal, 0));
    const tax = round2(subtotal * 0.0825);
    const number = await nextNumber(db, "acct_recurring_invoices", "template_number", "REC", tenant);
    const { data, error } = await db.from("acct_recurring_invoices").insert({
      tenant_id: tenant, entity_id: entityId, customer_id: b.customer_id,
      template_number: number, name: b.name, frequency: b.frequency || "monthly",
      next_run_date: b.next_run_date, end_date: b.end_date || null, currency: "USD",
      subtotal, tax_total: tax, total: round2(subtotal + tax), status: "active", lines,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return ok({ id: data.id, template_number: number });
  } catch (e) { return fail(e); }
}
