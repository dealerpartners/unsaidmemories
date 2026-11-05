import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { getPgWithRetry } from "@/lib/pg";

// Pool-backed runner with the exact withPg contract (fn(client) → result,
// null on failure). withPg's session-pooler Client cannot establish SSL
// from this runtime (the EMAXCONNSESSION/SSL failure class lib/pg was
// built to fix); the transaction pooler in lib/pg works everywhere and a
// checked-out PoolClient has the same .query() surface as a Client, so no
// call site below changes.
async function withPg<T>(fn: (client: any) => Promise<T>): Promise<T | null> {
  let client: any;
  try { client = await getPgWithRetry(); } catch { return null; }
  try { return await fn(client); }
  catch (e) { console.error("[withPg->pool] Query execution failed:", e instanceof Error ? e.message : String(e)); return null; }
  finally { client.release(); }
}
import { PAY_TYPES } from "@/lib/crm/commissions";

// POST /api/admin/payroll/employees — add an employee to crm_staff
// Body: { first_name, last_name, email, phone, role, is_service_staff, hire_date,
//         pay_type ('hourly'|'salary'|'commission'|'salary_plus_commission'|
//         'hourly_plus_commission'), hourly_rate, salary_amount, salary_period
//         ('annual'|'monthly'|'biweekly'|'weekly'), commission_rate (percent),
//         bank_routing_number, bank_account_number, bank_account_type }
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("staff_groomer_management", "write");
  if (gate) return gate;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  if (!firstName || !lastName) {
    return NextResponse.json({ ok: false, error: "first_name and last_name are required" }, { status: 400 });
  }
  const email = body.email ? String(body.email).trim() : null;
  const phone = body.phone ? String(body.phone).trim() : null;
  const role = body.role ? String(body.role).trim() : "Staff";
  const isGroomer = !!body.is_service_staff;
  const hireDate = body.hire_date ? String(body.hire_date) : null;
  const displayName = `${firstName} ${lastName}`.trim();

  // Wage setup on the staff profile (crm_staff.pay_type / hourly_rate /
  // salary_amount / salary_period / commission_rate)
  const payType = body.pay_type ? String(body.pay_type).trim().toLowerCase() : "hourly";
  if (!(PAY_TYPES as readonly string[]).includes(payType)) {
    return NextResponse.json({ ok: false, error: `pay_type must be one of: ${PAY_TYPES.join(", ")}` }, { status: 400 });
  }
  const parseRate = (v: any): { value: number | null; valid: boolean } => {
    if (v === null || v === undefined || String(v).trim() === "") return { value: null, valid: true };
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? { value: n, valid: true } : { value: null, valid: false };
  };
  const hourly = parseRate(body.hourly_rate);
  const salary = parseRate(body.salary_amount);
  if (!hourly.valid || !salary.valid) {
    return NextResponse.json({ ok: false, error: "hourly_rate and salary_amount must be non-negative numbers" }, { status: 400 });
  }
  const commission = parseRate(body.commission_rate);
  if (!commission.valid || (commission.value != null && commission.value > 100)) {
    return NextResponse.json({ ok: false, error: "commission_rate must be a percent between 0 and 100" }, { status: 400 });
  }
  const salaryPeriod = body.salary_period ? String(body.salary_period).trim().toLowerCase() : null;
  if (salaryPeriod != null && !["annual", "monthly", "biweekly", "weekly"].includes(salaryPeriod)) {
    return NextResponse.json({ ok: false, error: "salary_period must be 'annual', 'monthly', 'biweekly' or 'weekly'" }, { status: 400 });
  }

  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    // Check if bank columns exist (added via migration)
    const colCheck = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_staff'
          AND column_name IN ('bank_routing_number', 'bank_account_number', 'bank_account_type')`,
    );
    const hasBankCols = colCheck.rows.length === 3;

    let r;
    if (hasBankCols) {
      r = await client.query(
        `INSERT INTO public.crm_staff
           (id, tenant_id, display_name, first_name, last_name, email, phone, role,
            is_service_staff, is_active, hire_date, pay_type, hourly_rate, salary_amount,
            bank_routing_number, bank_account_number, bank_account_type,
            commission_rate, salary_period)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true, $9::date, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id::text AS id, display_name, pay_type,
                   hourly_rate::numeric AS hourly_rate, salary_amount::numeric AS salary_amount,
                   commission_rate::numeric AS commission_rate, salary_period`,
        [tenant, displayName, firstName, lastName, email, phone, role, isGroomer, hireDate,
         payType, hourly.value, salary.value,
         body.bank_routing_number ? String(body.bank_routing_number) : null,
         body.bank_account_number ? String(body.bank_account_number) : null,
         body.bank_account_type ? String(body.bank_account_type) : "checking",
         commission.value, salaryPeriod],
      );
    } else {
      r = await client.query(
        `INSERT INTO public.crm_staff
           (id, tenant_id, display_name, first_name, last_name, email, phone, role,
            is_service_staff, is_active, hire_date, pay_type, hourly_rate, salary_amount,
            commission_rate, salary_period)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true, $9::date, $10, $11, $12, $13, $14)
         RETURNING id::text AS id, display_name, pay_type,
                   hourly_rate::numeric AS hourly_rate, salary_amount::numeric AS salary_amount,
                   commission_rate::numeric AS commission_rate, salary_period`,
        [tenant, displayName, firstName, lastName, email, phone, role, isGroomer, hireDate,
         payType, hourly.value, salary.value, commission.value, salaryPeriod],
      );
    }
    // Sign-in provisioning (employee audit 2026-10-17): a payroll record
    // alone can never sign in — resolvePortalUser reads portal_users →
    // tenant_memberships → legacy staff, never crm_staff — and the
    // employee Pay view keys off crm_staff.user_id, which this insert used
    // to leave NULL forever. Complete the same chain as Add Team Member:
    // find-or-invite the auth user, upsert the membership + legacy staff
    // row, and link crm_staff.user_id. Best-effort; reported honestly.
    const signIn = await (async (): Promise<{ authUserId: string | null; invited: boolean; note: string }> => {
      if (!email || !email.includes("@")) {
        return { authUserId: null, invited: false, note: "No email on the profile — no sign-in was provisioned." };
      }
      const roleLower = role.trim().toLowerCase();
      const membershipRole = ["owner", "admin", "manager", "staff", "viewer", "seller", "stylist", "bather", "reception"].includes(roleLower)
        ? roleLower : "staff";
      let authUserId: string | null = null;
      let invited = false;
      try {
        const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
        const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        if (sbUrl && sbKey) {
          const supabaseAdmin = createClient(sbUrl, sbKey, { auth: { autoRefreshToken: false, persistSession: false } });
          const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
          const found = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (found) {
            authUserId = found.id;
            if (!found.email_confirmed_at) {
              await supabaseAdmin.auth.admin.inviteUserByEmail(email, { data: found.user_metadata || {} });
              invited = true;
            }
          } else {
            const { data: invitedUser, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
              data: { full_name: displayName, role: membershipRole },
            });
            if (!error && invitedUser?.user) { authUserId = invitedUser.user.id; invited = true; }
          }
        }
      } catch { /* best-effort; reported below */ }
      if (!authUserId) {
        return { authUserId: null, invited: false, note: "Payroll profile saved, but the sign-in invite could not be completed — check Supabase auth configuration." };
      }
      await client.query(
        `INSERT INTO public.tenant_memberships (id, tenant_id, user_id, role, active, status, mfa_enabled, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2::uuid, $3, true, 'active', false, NOW(), NOW())
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, active = true, status = 'active', updated_at = NOW()`,
        [tenant, authUserId, membershipRole],
      );
      await client.query(
        `INSERT INTO public.staff (id, name, email, phone, role, active, "userId", tenant_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, $6) ON CONFLICT DO NOTHING`,
        [displayName, email, phone, membershipRole, authUserId, tenant],
      );
      await client.query(`UPDATE public.staff SET active = true WHERE "userId"::text = $1`, [authUserId]);
      await client.query(`UPDATE public.crm_staff SET user_id = $2::uuid, updated_at = now() WHERE id = $1::uuid AND tenant_id = $3`, [r.rows[0].id, authUserId, tenant]);
      return {
        authUserId, invited,
        note: invited
          ? `Sign-in invitation emailed to ${email} — they set their own password from the link and land in the employee portal.`
          : `${email} already has an account — employee portal access is active for them now.`,
      };
    })();

    return NextResponse.json({
      ok: true,
      employee: r.rows[0],
      signIn,
      bankColumnsAvailable: hasBankCols,
      ...(hasBankCols ? {} : { note: "Bank columns not yet added — run the payroll-bank-columns SQL to enable ACH." }),
    });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
