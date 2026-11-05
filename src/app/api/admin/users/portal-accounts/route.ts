/**
 * /api/admin/users/portal-accounts — Customer Portal Accounts.
 * GET  — every Supabase Auth account that is NOT staff, joined with its
 *        CRM customer record (by email) and order count.
 * POST — account actions: { userId, action: 'ban' | 'unban' | 'confirm' }.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireModuleApi, getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { listAuthUsers, listStaffWithGrants, writePermissionAudit } from "@/lib/admin/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "read");
  if (mod) return mod;
  try {
    const db = createServerClient();
    const [authUsers, staff] = await Promise.all([listAuthUsers(), listStaffWithGrants()]);
    const staffAuthIds = new Set(staff.map((s) => s.user_id));
    const customers = authUsers.filter((u) => !staffAuthIds.has(u.id));

    const emails = customers.map((u) => u.email).filter(Boolean) as string[];
    const crmByEmail = new Map<string, { id: string; name: string | null }>();
    if (emails.length) {
      const { data } = await db
        .from("crm_customers")
        .select("id, email, first_name, last_name")
        .eq("tenant_id", getTenantId())
        .in("email", emails);
      for (const c of data ?? []) {
        crmByEmail.set((c.email as string).toLowerCase(), {
          id: c.id as string,
          name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
        });
      }
    }
    const ids = customers.map((u) => u.id);
    const orderCounts = new Map<string, number>();
    if (ids.length) {
      const { data } = await db.from("orders").select("customer_id").in("customer_id", ids);
      for (const o of data ?? []) {
        orderCounts.set(o.customer_id as string, (orderCounts.get(o.customer_id as string) ?? 0) + 1);
      }
    }
    return NextResponse.json({
      accounts: customers.map((u) => ({
        ...u,
        crm: u.email ? crmByEmail.get(u.email.toLowerCase()) ?? null : null,
        orderCount: orderCounts.get(u.id) ?? 0,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "List failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "write");
  if (mod) return mod;
  try {
    const body = await req.json();
    const userId = String(body.userId || "");
    const action = String(body.action || "");
    if (!userId || !["ban", "unban", "confirm"].includes(action)) {
      return NextResponse.json({ error: "userId and a valid action are required." }, { status: 400 });
    }
    const db = createServerClient();
    const ctx = await getAdminContext();
    if (action === "ban") {
      const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (action === "unban") {
      const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await db.auth.admin.updateUserById(userId, { email_confirm: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await writePermissionAudit({
      portalUserId: ctx?.portalUserId ?? userId,
      changedBy: ctx?.portalUserId ?? null,
      changeType: `portal_account_${action}`,
      key: userId,
      oldValue: "",
      newValue: action,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
  }
}
