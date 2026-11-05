import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { requireAdminApi } from "@/lib/admin/gate";
import { pgConnectionString, toTransactionPooler } from "@/lib/pg";
import { resolveTenantId } from "@/lib/tenant-id";
import { MASTER_TENANT_ID } from "@/lib/site-tenant-shared";

const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "")?.replace(/\/$/, "");
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

function getSupabaseAdmin() {
  if (!SB_URL || !SB_SERVICE_KEY) return null;
  return createClient(SB_URL, SB_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getPgClient() {
  const cs = toTransactionPooler(process.env.SUPABASE_SESSION_POOLER || process.env.SUPABASE_DIRECT_CONNECTION || pgConnectionString);
  if (!cs) return null;
  const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

// --- Team lifecycle emails (Sunny's design set) -------------------------
// Provisioning, role changes and removals each produce their email:
// the member hears about role changes and removals directly; the
// operator inbox hears about joins and role changes (the internal
// copy). All fire-and-forget — a mail failure never blocks the
// admin action that caused it.
async function teamEmail(to: string, template: string, subject: string, vars: Record<string, unknown>) {
  try {
    const { sendEmail } = await import("@/lib/email");
    const { renderHostedEmail } = await import("@/lib/email/hosted-render");
    const { toResendVariables } = await import("@/lib/email/resend-templates");
    const v = toResendVariables(vars);
    await sendEmail({ to, template, subject, html: renderHostedEmail(template, v) || "", variables: v });
  } catch { /* never blocks the admin action */ }
}

async function notifyTeamJoined(email: string, name: string | null, role: string) {
  try {
    const { salonAlertDestination } = await import("@/lib/email");
    const { SITE_URL } = await import("@/lib/site-url");
    const to = await salonAlertDestination();
    if (!to) return;
    await teamEmail(to, "team_member_joined", `New team member — ${email}`, {
      newMemberName: name || email.split("@")[0],
      newMemberEmail: email,
      role,
      adminUrl: `${SITE_URL}/admin/users`,
    });
  } catch { /* fire-and-forget */ }
}

async function notifyRoleChanged(supabaseAdmin: any, userId: string | null, id: string | null, newRole: string) {
  try {
    if (!supabaseAdmin || (!userId && !id)) return;
    let q = supabaseAdmin.from("tenant_memberships").select("role, user_id");
    q = userId ? q.eq("user_id", userId) : q.eq("id", id);
    const { data: mem } = await q.maybeSingle();
    const oldRole = mem?.role ? String(mem.role) : "";
    const uid = userId || (mem?.user_id ? String(mem.user_id) : null);
    if (!uid || !oldRole || oldRole === newRole) return;
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
    const email = u?.user?.email;
    const { SITE_URL } = await import("@/lib/site-url");
    if (email) {
      await teamEmail(email, "team_role_changed", "Your role on the team has changed", {
        oldRole, newRole, workspaceUrl: `${SITE_URL}/admin`,
      });
    }
    const { salonAlertDestination } = await import("@/lib/email");
    const alertTo = await salonAlertDestination();
    if (alertTo) {
      await teamEmail(alertTo, "internal_team_notification", "Team update — a role changed", {
        oldRole, newRole, workspaceUrl: `${SITE_URL}/admin/users`,
      });
    }
  } catch { /* fire-and-forget */ }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const pgClient = await getPgClient();

    if (pgClient) {
      const membersRes = await pgClient.query(`
        SELECT tm.id, tm.tenant_id, tm.user_id, tm.role, tm.active, tm.status, tm.created_at, tm.last_active_at, tm.mfa_enabled,
               u.email, u.email_confirmed_at,
               s.name as staff_name, s.avatar as staff_avatar,
               cs.display_name as crm_name
        FROM public.tenant_memberships tm
        LEFT JOIN auth.users u ON tm.user_id::text = u.id::text
        LEFT JOIN public.staff s ON tm.user_id::text = s."userId"::text
        LEFT JOIN public.crm_staff cs ON tm.user_id::text = cs.user_id::text
        ORDER BY tm.created_at DESC;
      `);

      // Customer identities: one row per real person from the owner's
      // registry — portal_customer_accounts (login ↔ crm_customers), joined
      // to auth.users for confirmation/login state. The salon-side link is
      // crm_customers.source_customer_id (→ customers.id, whose "userId"
      // mirrors the auth link); the order-side link is the order's own
      // email / customerId. Owner-declared admins and staff are excluded.
      const portalRes = await pgClient.query(`
        SELECT pca.id::text AS portal_id, pca.auth_user_id::text AS auth_user_id, pca.status AS portal_status,
               pca.invited_at::text AS invited_at, pca.last_login_at::text AS last_login_at,
               cc.id::text AS crm_id, cc.first_name, cc.last_name, cc.email AS crm_email,
               cc.phone, cc.source_customer_id,
               u.email, u.email_confirmed_at::text AS email_confirmed_at, u.last_sign_in_at::text AS last_sign_in_at
        FROM public.portal_customer_accounts pca
        JOIN public.crm_customers cc ON pca.customer_id = cc.id
        LEFT JOIN auth.users u ON pca.auth_user_id = u.id
        WHERE pca.tenant_id = $1
        ORDER BY pca.created_at DESC;
      `, [resolveTenantId()]);

      // App-table mirror for the salon link (customers."userId").
      const appCustRes = await pgClient.query(`SELECT id, "userId"::text AS user_id, email FROM public.customers;`);
      const appCustByEmail = new Map<string, any>();
      for (const r of appCustRes.rows) appCustByEmail.set(String(r.email || "").toLowerCase(), r);

      // Shop orders live in commerce_orders (public.orders never existed
      // in this schema — the stale reference 500'd the whole endpoint).
      const ordersRes = await pgClient.query(`SELECT id, customer_id AS "customerId", customer_email AS email FROM public.commerce_orders;`).catch(() => ({ rows: [] as any[] }));

      let rolesRes = { rows: [] };
      try {
        rolesRes = await pgClient.query(`SELECT * FROM public.role_definitions ORDER BY created_at ASC;`);
      } catch { /* table may not exist yet */ }

      await pgClient.end();

      const adminsAndStaff = Object.values(
        membersRes.rows.reduce((acc: Record<string, any>, r: any) => {
          // The fan-out joins (staff + crm_staff) can duplicate a membership
          // row — dedupe by membership id so each user appears once.
          if (!acc[r.id]) acc[r.id] = r;
          return acc;
        }, {}) as Record<string, any>
      ).map((r: any) => {
        const name = r.crm_name || r.staff_name || (r.email ? r.email.split("@")[0] : "User");
        const initials = name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
        return {
          id: r.id, userId: r.user_id, email: r.email || "No email", name, role: r.role,
          twoFactorEnabled: !!r.mfa_enabled,
          status: !r.email_confirmed_at
            ? "Invited"
            : r.status === "active" ? "Active" : r.status === "invited" ? "Invited" : "Suspended",
          lastActive: r.last_active_at ? new Date(r.last_active_at).toLocaleString() : "Recently",
          avatarInitials: initials,
          scope: ["owner", "admin", "manager"].includes(r.role) ? "admin" : "employee",
        };
      });

      // Owner-declared admins never appear as customers (their memberships
      // may not exist in edge cases).
      const adminEmails = (process.env.ADMIN_EMAILS || "")
        .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

      const ordersRows = ordersRes.rows || [];
      const customers = portalRes.rows
        .filter((r: any) => !adminEmails.includes((r.email || r.crm_email || "").toLowerCase()))
        .map((r: any) => {
          const email = (r.email || r.crm_email || "").toLowerCase();
          const appRow = appCustByEmail.get(email) || null;
          const salonLinked =
            !!r.source_customer_id ||
            !!(appRow && r.auth_user_id && appRow.user_id === r.auth_user_id);
          const appCustomerId = r.source_customer_id || appRow?.id || null;
          const userOrders = ordersRows.filter(
            (o: any) =>
              (o.email && email && o.email.toLowerCase() === email) ||
              (salonLinked && appCustomerId && o.customerId === appCustomerId),
          );
          const displayName = `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email || "Customer";
          const initials = displayName.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
          const lastActiveTs = r.last_login_at || r.last_sign_in_at;
          return {
            id: r.portal_id,
            userId: r.auth_user_id,
            customerId: appCustomerId,
            crmCustomerId: r.crm_id,
            portalAccountId: r.portal_id,
            email: r.email || "No email",
            name: displayName,
            phone: r.phone || "",
            role: "customer",
            twoFactorEnabled: false,
            status: r.email_confirmed_at ? "Active" : "Invited",
            lastActive: lastActiveTs
              ? new Date(lastActiveTs).toLocaleString()
              : r.email_confirmed_at ? "Active" : "Never",
            avatarInitials: initials,
            scope: "customer",
            // Linked-record indicators (owner's join spec §5)
            salonLinked,
            ordersLinked: userOrders.length > 0,
            ordersCount: userOrders.length,
            linkedBoth: salonLinked && userOrders.length > 0,
          };
        });

      return NextResponse.json({
        admins: adminsAndStaff.filter((u: any) => u.scope === "admin"),
        staff: adminsAndStaff.filter((u: any) => u.scope === "employee"),
        customers, roles: rolesRes.rows,
      });
    }

    // Direct Supabase API Fallback
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase connection not configured" }, { status: 500 });
    }

    const [authUsersRes, membersRes, staffRes, custRes] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 }),
      supabaseAdmin.from("tenant_memberships").select("*"),
      supabaseAdmin.from("staff").select("*"),
      supabaseAdmin.from("customers").select("*"),
    ]);

    const authMap = new Map<string, any>();
    authUsersRes.data?.users?.forEach((u) => authMap.set(u.id, u));

    const staffUserMap = new Map<string, any>();
    staffRes.data?.forEach((s) => {
      if (s.userId) staffUserMap.set(s.userId, s);
    });

    const adminsAndStaff = (membersRes.data || []).map((m: any) => {
      const authUser = authMap.get(m.user_id);
      const staffInfo = staffUserMap.get(m.user_id);
      const name = staffInfo?.name || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || (authUser?.email ? authUser.email.split("@")[0] : "Staff Member");
      const email = authUser?.email || staffInfo?.email || "No email";
      const initials = name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
      const scope = ["owner", "admin", "manager"].includes(m.role) ? "admin" : "employee";

      return {
        id: m.id,
        userId: m.user_id,
        email,
        name,
        role: m.role,
        twoFactorEnabled: !!m.mfa_enabled,
        status: m.status === "active" ? "Active" : m.status === "invited" ? "Invited" : "Suspended",
        lastActive: m.last_active_at ? new Date(m.last_active_at).toLocaleString() : "Recently",
        avatarInitials: initials,
        scope,
      };
    });

    const ordersRes = await supabaseAdmin.from("commerce_orders").select("id,customer_id,customer_email").then((r: any) => r, () => ({ data: null }));
    const ordersRows = ((ordersRes.data || []) as any[]).map((o: any) => ({ ...o, customerId: o.customerId ?? o.customer_id, email: o.email ?? o.customer_email }));
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const memberUserIds = new Set((membersRes.data || []).map((m: any) => m.user_id));

    const customers = (custRes.data || [])
      .filter((c: any) => !memberUserIds.has(c.userId) && !adminEmails.includes((c.email || "").toLowerCase()))
      .map((c: any) => {
        const userOrders = ordersRows.filter(
          (o: any) =>
            (o.email && c.email && o.email.toLowerCase() === c.email.toLowerCase()) ||
            (c.id && o.customerId === c.id),
        );
        const name = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email || "Customer";
        const initials = name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
        const authUser = authMap.get(c.userId);
        return {
          id: c.id,
          userId: c.userId || c.id,
          customerId: c.id,
          email: c.email || "No email",
          name,
          phone: c.phone || "",
          role: "customer",
          twoFactorEnabled: false,
          status: authUser ? (authUser.email_confirmed_at ? "Active" : "Invited") : (c.customerStatus === "ACTIVE" ? "Active" : "Invited"),
          lastActive: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "Active",
          avatarInitials: initials,
          scope: "customer",
          salonLinked: !!c.userId,
          ordersLinked: userOrders.length > 0,
          ordersCount: userOrders.length,
          linkedBoth: !!c.userId && userOrders.length > 0,
        };
      });

    return NextResponse.json({
      admins: adminsAndStaff.filter((u: any) => u.scope === "admin"),
      staff: adminsAndStaff.filter((u: any) => u.scope === "employee"),
      customers,
      roles: [],
    });
  } catch (err: any) {
    console.error("[GET /api/admin/users]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  try {
    const body = await req.json();
    // `scope` is intentionally NOT read — the role alone determines the
    // portal (one way to assign). A client-supplied scope is ignored.
    const { email, password, name, role, phone, tenantId, enforce2FA, resendInvite } = body;
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const targetTenant = tenantId || MASTER_TENANT_ID;
    const supabaseAdmin = getSupabaseAdmin();
    const pgClient = await getPgClient();

    // --- Resend invitation for an existing user -----------------------------
    if (resendInvite) {
      if (!supabaseAdmin) {
        return NextResponse.json({ error: "Supabase connection not configured" }, { status: 500 });
      }
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
      const found = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!found) {
        return NextResponse.json({ error: "No account found for that email." }, { status: 404 });
      }
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: found.user_metadata || {},
      });
      if (inviteError) {
        return NextResponse.json({ error: inviteError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, email, message: `Invitation re-sent to ${email}.` });
    }

    if (!role) return NextResponse.json({ error: "Role is required" }, { status: 400 });

    let authUserId: string | null = null;
    let inviteSent = false;
    if (supabaseAdmin) {
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
      const found = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) {
        authUserId = found.id;
        // Existing account that never confirmed its email — re-send the
        // invitation so they can still set a password.
        if (!found.email_confirmed_at) {
          await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: found.user_metadata || {},
          });
          inviteSent = true;
        }
      } else {
        // THE INVITE FLOW (the owner's spec): Supabase emails the user a link
        // to set their own password — no silent random password, no
        // pre-confirmed email. If the admin typed a temporary password it is
        // set on the account, and the email STILL goes out unconfirmed so
        // the user lands on set-password and chooses their own.
        if (password) {
          const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
            email, password, email_confirm: false, user_metadata: { full_name: name, role },
          });
          if (!error && newUser?.user) {
            authUserId = newUser.user.id;
            inviteSent = true; // email_confirm:false + autoconfirm off → Supabase emails the link
          }
        } else {
          const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { full_name: name, role },
          });
          if (!error && invited?.user) {
            authUserId = invited.user.id;
            inviteSent = true;
          }
        }
      }
    }

    if (pgClient) {
      if (!authUserId) {
        const dbUser = await pgClient.query("SELECT id::text FROM auth.users WHERE email = $1 LIMIT 1", [email]);
        if (dbUser.rows.length > 0) authUserId = dbUser.rows[0].id;
        else authUserId = (await pgClient.query("SELECT gen_random_uuid()::text as id")).rows[0].id;
      }

      const targetScope = ["owner", "admin", "manager"].includes(role) ? "admin" : role === "customer" ? "customer" : "employee";

      if (targetScope === "admin" || targetScope === "employee") {
        const validRole = ["owner", "admin", "manager", "staff", "viewer", "seller"].includes(role) ? role : "staff";
        await pgClient.query(`INSERT INTO public.tenant_memberships (id, tenant_id, user_id, role, active, status, mfa_enabled, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, true, 'active', $4, NOW(), NOW()) ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', mfa_enabled = EXCLUDED.mfa_enabled, updated_at = NOW();`, [targetTenant, authUserId, validRole, !!enforce2FA]);
        await pgClient.query(`INSERT INTO public.staff (id, name, email, phone, role, active, "userId", tenant_id) VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, $6) ON CONFLICT DO NOTHING;`, [name || email.split("@")[0], email, phone || null, validRole, authUserId, targetTenant]);
      }

      if (targetScope === "customer") {
        const custRes = await pgClient.query("SELECT id FROM public.customers WHERE email = $1 LIMIT 1", [email]);
        let customerId = custRes.rows[0]?.id;
        if (!customerId) {
          const parts = (name || "Customer").split(" ");
          const newCust = await pgClient.query(`INSERT INTO public.customers (id, "firstName", "lastName", email, phone, "customerStatus", "userId", tenant_id, "createdAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE', $5, $6, NOW()) RETURNING id;`, [parts[0], parts.slice(1).join(" ") || "", email, phone || null, authUserId, targetTenant]);
          customerId = newCust.rows[0].id;
        }
      }

      await pgClient.end();
      if (targetScope === "admin" || targetScope === "employee") {
        void notifyTeamJoined(email, name || null, role);
      }
      const inviteNote = inviteSent
        ? ` Invitation email sent to ${email} — they set their own password from the link.`
        : "";
      return NextResponse.json({ success: true, authUserId, email, role, scope: targetScope, inviteSent, message: `Provisioned ${email} with ${role} access.${inviteNote}` });
    }

    // Direct Supabase API Fallback
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase connection not configured" }, { status: 500 });
    }

    const targetScope = ["owner", "admin", "manager"].includes(role) ? "admin" : role === "customer" ? "customer" : "employee";

    if (targetScope === "admin" || targetScope === "employee") {
      const validRole = ["owner", "admin", "manager", "staff", "viewer", "seller"].includes(role) ? role : "staff";
      if (authUserId) {
        const { error: membershipErr } = await supabaseAdmin.from("tenant_memberships").upsert({
          tenant_id: targetTenant,
          user_id: authUserId,
          role: validRole,
          active: true,
          status: "active",
          mfa_enabled: !!enforce2FA,
        }, { onConflict: "tenant_id,user_id" });
        if (membershipErr) return NextResponse.json({ error: `Membership could not be written: ${membershipErr.message}` }, { status: 500 });
      }
      const { error: staffErr } = await supabaseAdmin.from("staff").insert({
        name: name || email.split("@")[0],
        email,
        phone: phone || null,
        role: validRole,
        active: true,
        userId: authUserId,
        tenant_id: targetTenant,
      });
      if (staffErr) return NextResponse.json({ error: `Staff record could not be created: ${staffErr.message}` }, { status: 500 });
    }

    if (targetScope === "customer") {
      const parts = (name || "Customer").split(" ");
      const { error: customerErr } = await supabaseAdmin.from("customers").insert({
        firstName: parts[0],
        lastName: parts.slice(1).join(" ") || "",
        email,
        phone: phone || null,
        customerStatus: "ACTIVE",
        userId: authUserId,
        tenant_id: targetTenant,
      });
      if (customerErr) return NextResponse.json({ error: `Customer record could not be created: ${customerErr.message}` }, { status: 500 });
    }

    if (targetScope === "admin" || targetScope === "employee") {
      void notifyTeamJoined(email, name || null, role);
    }
    const inviteNote = inviteSent
      ? ` Invitation email sent to ${email} — they set their own password from the link.`
      : "";
    return NextResponse.json({ success: true, authUserId, email, role, scope: targetScope, inviteSent, message: `Provisioned ${email} with ${role} access via Supabase.${inviteNote}` });
  } catch (err: any) {
    console.error("[POST /api/admin/users]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  try {
    const body = await req.json();
    const { id, userId, role, status, mfa_enabled } = body;
    const pgClient = await getPgClient();
    const supabaseAdmin = getSupabaseAdmin();

    if (role) {
      // Reads the pre-change role + member email and fires the
      // role-change emails; must run before the update lands.
      await notifyRoleChanged(supabaseAdmin, userId || null, id || null, role);
    }

    if (pgClient) {
      if (role) {
        await pgClient.query("UPDATE public.tenant_memberships SET role = $1, updated_at = NOW() WHERE id::text = $2 OR user_id::text = $3", [role, id, userId]);
        await pgClient.query("UPDATE public.staff SET role = $1 WHERE \"userId\"::text = $2", [role, userId]);
      }
      if (status) await pgClient.query("UPDATE public.tenant_memberships SET status = $1, updated_at = NOW() WHERE id::text = $2 OR user_id::text = $3", [status.toLowerCase(), id, userId]);
      if (mfa_enabled !== undefined) await pgClient.query("UPDATE public.tenant_memberships SET mfa_enabled = $1, updated_at = NOW() WHERE id::text = $2 OR user_id::text = $3", [!!mfa_enabled, id, userId]);
      await pgClient.end();
      return NextResponse.json({ success: true, message: "User updated." });
    }

    if (supabaseAdmin) {
      if (role && userId) {
        await supabaseAdmin.from("tenant_memberships").update({ role, updated_at: new Date().toISOString() }).eq("user_id", userId);
        await supabaseAdmin.from("staff").update({ role }).eq("userId", userId);
      }
      if (status && userId) {
        await supabaseAdmin.from("tenant_memberships").update({ status: status.toLowerCase(), updated_at: new Date().toISOString() }).eq("user_id", userId);
      }
      if (mfa_enabled !== undefined && userId) {
        await supabaseAdmin.from("tenant_memberships").update({ mfa_enabled: !!mfa_enabled, updated_at: new Date().toISOString() }).eq("user_id", userId);
      }
      return NextResponse.json({ success: true, message: "User updated via Supabase." });
    }

    return NextResponse.json({ error: "No DB connection available" }, { status: 500 });
  } catch (err: any) {
    console.error("[PATCH /api/admin/users]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");
    if (!id && !userId) return NextResponse.json({ error: "id or userId required" }, { status: 400 });

    const pgClient = await getPgClient();
    const supabaseAdmin = getSupabaseAdmin();

    // Resolve the member's email before the records go — the removal
    // email (Sunny's design) is the last thing they hear from us.
    let removedEmail: string | null = null;
    let removedUserId: string | null = userId || null;
    try {
      if (supabaseAdmin && (id || userId)) {
        let q = supabaseAdmin.from("tenant_memberships").select("user_id");
        q = userId ? q.eq("user_id", userId) : q.eq("id", id);
        const { data: mem } = await q.maybeSingle();
        if (mem?.user_id) removedUserId = String(mem.user_id);
        if (removedUserId) {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(removedUserId);
          removedEmail = u?.user?.email || null;
        }
      }
    } catch { /* email resolution is best-effort */ }

    if (pgClient) {
      if (id) await pgClient.query("DELETE FROM public.tenant_memberships WHERE id::text = $1", [id]);
      if (userId) {
        await pgClient.query("DELETE FROM public.tenant_memberships WHERE user_id::text = $1", [userId]);
        await pgClient.query("DELETE FROM public.staff WHERE \"userId\"::text = $1", [userId]);
      }
      await pgClient.end();
      if (removedEmail) {
        void teamEmail(removedEmail, "team_member_removed", "You've been removed from the team", {});
      }
      return NextResponse.json({ success: true, message: "Access revoked." });
    }

    if (supabaseAdmin) {
      if (id) await supabaseAdmin.from("tenant_memberships").delete().eq("id", id);
      if (userId) {
        await supabaseAdmin.from("tenant_memberships").delete().eq("user_id", userId);
        await supabaseAdmin.from("staff").delete().eq("userId", userId);
      }
      if (removedEmail) {
        void teamEmail(removedEmail, "team_member_removed", "You've been removed from the team", {});
      }
      return NextResponse.json({ success: true, message: "Access revoked via Supabase." });
    }

    return NextResponse.json({ error: "No DB connection available" }, { status: 500 });
  } catch (err: any) {
    console.error("[DELETE /api/admin/users]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
