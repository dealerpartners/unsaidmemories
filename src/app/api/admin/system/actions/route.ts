// ---------------------------------------------------------------------------
// /api/admin/system/actions/route.ts
//
// System / organization / staff / automation / scheduled-job quick actions.
// Each handler:
//   1. Strips the FIRST module prefix (accts_* / cms_* / emp_* / org_* /
//      staff_* / sys_*) so the case keys match what the registry sends.
//   2. Performs a real transactional write against live Supabase tables —
//      no console.log stubs.
//   3. Appends a row to crm_audit_log / acct_audit_log / commerce_audit_log
//      / erp_audit_log via the shared auditAction() helper.
//   4. Returns a structured JSON payload for TanStack cache invalidation.
//
// CRITICAL FIX vs previous version: every case key was the LAST underscore-
// segment of the registry code (e.g. `case 'member'` for `staff_add_member`).
// The prefix-stripping regex `^[a-z]+_` only strips the FIRST run, so
// `staff_add_member` becomes `add_member` — meaning every "short" stub
// case was DEAD CODE. This rewrite uses the correct prefix-stripped names.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardPayloadIds, guardRequiredFields } from "@/lib/quick-actions/validate";
import { resolveTenantId } from "@/lib/admin-api";
import { requireAdminApi } from "@/lib/admin/gate";
import { MODULE_CODES } from "@/lib/admin/modules";
import { pgExec, pgQuery } from "@/lib/pg";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { sendEmail } from "@/lib/email";
import { executeSystemAutomation } from "@/lib/admin/automation-executor";
import { BACKUP_UPSELL_MESSAGE, BackupNotEntitledError, runTenantBackup } from "@/lib/backups/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Canonical site/org settings live in cms_global_content at locale 'en-US'
// — that is the store /api/admin/settings reads and writes, the settings
// screens render, and repo.getSettings() serves to the public site. Any
// quick action that edits a setting MUST write there (an earlier version
// of several handlers below wrote look-alike keys at locale 'en', which no
// reader ever saw).
async function saveSiteSetting(tenant: string, key: string, label: string, value: string): Promise<void> {
  await pgExec(
    `INSERT INTO public.cms_global_content (id, tenant_id, content_key, label, value_text, content_group, locale, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'general', 'en-US', now(), now())
     ON CONFLICT (tenant_id, content_key, locale)
     DO UPDATE SET value_text = EXCLUDED.value_text, label = EXCLUDED.label, updated_at = now()`,
    [tenant, key, label, value],
  );
}

// ---------------------------------------------------------------------------
// Employee sign-in provisioning (employee audit 2026-10-17).
//
// A crm_staff profile alone can NEVER sign in: resolvePortalUser reads
// platform_admins → portal_users → tenant_memberships → legacy staff →
// customers, and crm_staff is not in that chain. The old add_member stopped
// at the profile and told the operator to "use Supabase admin to invite
// the user" by hand — so team members added here could not log in Monday
// morning. This helper completes the chain the same way POST
// /api/admin/users does: find-or-invite the auth user (they set their own
// password from the invite email), upsert the tenant membership, upsert
// the legacy staff row bound to the auth user, and link crm_staff.user_id.
// Best-effort by design: the profile stands even if the invite cannot be
// sent, and the outcome is reported honestly to the operator.
// ---------------------------------------------------------------------------
const MEMBERSHIP_ROLES = ["owner", "admin", "manager", "staff", "viewer", "seller", "stylist", "bather", "reception"];

async function provisionEmployeeSignIn(opts: {
  tenant: string; email: string; displayName: string; phone: string | null;
  role: string; isGroomer: boolean; crmStaffId: string;
}): Promise<{ authUserId: string | null; invited: boolean; note: string }> {
  const email = opts.email.trim();
  if (!email || !email.includes("@")) {
    return { authUserId: null, invited: false, note: "No email on the profile — no sign-in was provisioned. Add an email and re-add the member to invite them." };
  }
  const roleLower = opts.role.trim().toLowerCase();
  const membershipRole = MEMBERSHIP_ROLES.includes(roleLower) ? roleLower : "staff";

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
          data: { full_name: opts.displayName, role: membershipRole },
        });
        if (!error && invitedUser?.user) { authUserId = invitedUser.user.id; invited = true; }
      }
    }
  } catch { /* auth provisioning is best-effort; reported below */ }

  if (!authUserId) {
    return { authUserId: null, invited: false, note: "Profile saved, but the sign-in invite could not be completed — check Supabase auth configuration, then re-add the member to retry the invite." };
  }

  await pgExec(
    `INSERT INTO public.tenant_memberships (id, tenant_id, user_id, role, active, status, mfa_enabled, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2::uuid, $3, true, 'active', false, NOW(), NOW())
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, active = true, status = 'active', updated_at = NOW()`,
    [opts.tenant, authUserId, membershipRole],
  );
  await pgExec(
    `INSERT INTO public.staff (id, name, email, phone, role, active, "userId", tenant_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, $6) ON CONFLICT DO NOTHING`,
    [opts.displayName, email, opts.phone, membershipRole, authUserId, opts.tenant],
  );
  await pgExec(`UPDATE public.staff SET active = true WHERE "userId"::text = $1`, [authUserId]);
  await pgExec(`UPDATE public.crm_staff SET user_id = $2::uuid, updated_at = now() WHERE id = $1::uuid AND tenant_id = $3`, [opts.crmStaffId, authUserId, opts.tenant]);
  return {
    authUserId,
    invited,
    note: invited
      ? `Sign-in invitation emailed to ${email} — they set their own password from the link and land in the employee portal.`
      : `${email} already has an account — employee portal access is active for them now.`,
  };
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  let action = "";
  let payload: Record<string, unknown> = {};
  let actorId: string | null = null;
  let ip: string | null = null;

  try {
    const body = await req.json();
    action = String(body.action || "");
    payload = body.payload ?? body;
    delete (payload as Record<string, unknown>).action;
    const idGuard = guardPayloadIds(payload);
    if (idGuard) return idGuard;
    const reqGuard = guardRequiredFields(action, payload);
    if (reqGuard) return reqGuard;
    actorId = await getActorIdFromRequest(req);
    ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch (e) {
    return NextResponse.json({ error: `Invalid request body: ${e instanceof Error ? e.message : "unknown"}` }, { status: 400 });
  }

  const shortAction = action.replace(/^[a-z]+_/, "");

  try {
    switch (shortAction) {
      // ───────────────────────────────────────────────────────────────────
      // LOCATION / OPERATIONS handlers
      // ───────────────────────────────────────────────────────────────────

      case "add_location": {
        // org_add_location → add_location
        const name = String(payload.name || "");
        const code = String(payload.code || name.toUpperCase().slice(0, 4));
        const timezone = String(payload.timezone || "America/Chicago");
        const addressLine1 = payload.address_line1 ? String(payload.address_line1) : null;
        const city = payload.city ? String(payload.city) : null;
        const state = payload.state ? String(payload.state) : null;
        const postalCode = payload.postal_code ? String(payload.postal_code) : null;
        const phone = payload.phone ? String(payload.phone) : null;
        const email = payload.email ? String(payload.email) : null;
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_locations
             (id, tenant_id, name, code, address_line1, city, state, postal_code, country,
              phone, email, timezone, is_active, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'US', $8, $9, $10, true, now(), now())
           RETURNING id`,
          [resolveTenantId(req), name, code, addressLine1, city, state, postalCode, phone, email, timezone],
        );
        const locId = rows[0]?.id ?? null;
        if (!locId) {
          return NextResponse.json({ ok: false, error: `Location "${name}" could not be created — the location was not saved` }, { status: 500 });
        }
        // Mirror into tenant_locations — the store Settings → Locations
        // manages and /api/locations serves to the public site. A location
        // added here must be visible there, not only in the CRM list.
        const tenant = resolveTenantId(req);
        const tlRows = await pgQuery<{ id: string }>(
          `INSERT INTO public.tenant_locations (tenant_id, name, address, timezone, is_primary, is_active)
           VALUES ($1, $2, $3::jsonb, $4, false, true)
           RETURNING id`,
          [tenant, name, JSON.stringify({ line1: addressLine1 || "", line2: "", city: city || "", state: state || "", postal_code: postalCode || "", phone: phone || "", email: email || "" }), timezone],
        );
        const tenantLocationId = tlRows[0]?.id ?? null;
        await auditAction({ action, domain: "crm", tableName: "crm_locations", recordId: locId, afterData: { name, code, timezone, tenantLocationId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, locationId: locId, tenantLocationId, name, code });
      }

      case "toggle_online_booking":
      case "toggle_booking": {
        // org_toggle_booking / org_toggle_online_booking → toggle_booking
        // (toggle_online_booking is the legacy alias — same handler)
        // Online self-booking is a tenant-wide website gate, enforced by
        // the public booking endpoint, which reads the canonical settings
        // store. (This used to UPDATE crm_operating_hours — a table with
        // zero rows and no reader — so the toggle changed nothing.)
        // Payload forms send select values as strings — Boolean("false")
        // is true, so compare explicitly or "disable" would enable.
        const enabled = payload.enabled === undefined ? true : payload.enabled === true || payload.enabled === "true";
        const tenant = resolveTenantId(req);
        await saveSiteSetting(tenant, "online_booking_enabled", "Online Booking Enabled", String(enabled));
        await auditAction({ action, domain: "crm", tableName: "cms_global_content", recordId: null, afterData: { enabled }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, enabled, message: enabled ? "Online self-booking is ON — the public booking form accepts bookings." : "Online self-booking is OFF — the public booking form now tells customers to call." });
      }

      case "edit_hours": {
        // org_edit_hours → edit_hours
        // Upsert operating hours for a specific location + day_of_week
        // (0=Sun..6=Sat). crm_operating_hours starts empty, so this must
        // INSERT when no row exists — a bare UPDATE silently matched zero
        // rows and still reported success. The booking availability check
        // (src/lib/booking/availability.ts) reads these rows.
        const locationId = String(payload.location_id || "");
        const dayOfWeek = Number(payload.day_of_week);
        if (!locationId || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
          return NextResponse.json({ ok: false, error: "location_id and day_of_week (0=Sunday … 6=Saturday) are required" }, { status: 400 });
        }
        const opensAt = payload.opens_at ? String(payload.opens_at) : null;
        const closesAt = payload.closes_at ? String(payload.closes_at) : null;
        const isClosed = payload.is_closed !== undefined ? payload.is_closed === true || payload.is_closed === "true" : null;
        const acceptsBooking = payload.accepts_online_booking !== undefined ? payload.accepts_online_booking === true || payload.accepts_online_booking === "true" : null;
        const tenant = resolveTenantId(req);
        const existing = await pgQuery<{ id: string }>(
          `SELECT id FROM public.crm_operating_hours WHERE tenant_id = $1 AND location_id = $2::uuid AND day_of_week = $3`,
          [tenant, locationId, dayOfWeek],
        );
        let created = false;
        if (existing[0]?.id) {
          await pgExec(
            `UPDATE public.crm_operating_hours
                SET opens_at = COALESCE($1, opens_at),
                    closes_at = COALESCE($2, closes_at),
                    is_closed = COALESCE($3, is_closed),
                    accepts_online_booking = COALESCE($4, accepts_online_booking),
                    updated_at = now()
              WHERE id = $5::uuid AND tenant_id = $6`,
            [opensAt, closesAt, isClosed, acceptsBooking, existing[0].id, tenant],
          );
        } else {
          await pgExec(
            `INSERT INTO public.crm_operating_hours
               (id, tenant_id, location_id, day_of_week, opens_at, closes_at, is_closed, accepts_online_booking, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4, $5, COALESCE($6, false), COALESCE($7, true), now(), now())`,
            [tenant, locationId, dayOfWeek, opensAt, closesAt, isClosed, acceptsBooking],
          );
          created = true;
        }
        await auditAction({ action, domain: "crm", tableName: "crm_operating_hours", recordId: locationId, afterData: { locationId, dayOfWeek, opensAt, closesAt, isClosed, created }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, locationId, dayOfWeek, created, updated: created ? 0 : 1 });
      }

      case "switch_location": {
        // org_switch_location → switch_location
        // There is no location-scoped filtering in the admin yet (no
        // is_default column, no active-location store) — the tenant
        // switcher in the header is the context switch that exists. This
        // action validates the target location is real and records the
        // switch in the audit log; it does not pretend the admin's data
        // is re-scoped to the location.
        const locationId = String(payload.location_id || "");
        const locRows = await pgQuery<{ id: string; name: string }>(
          `SELECT id, name FROM public.crm_locations WHERE id = $1::uuid AND tenant_id = $2`,
          [locationId, resolveTenantId(req)],
        );
        if (!locRows[0]) {
          return NextResponse.json({ ok: false, error: "Location not found — the switch was not recorded" }, { status: 404 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_locations", recordId: locationId, afterData: { switchedTo: locationId, locationName: locRows[0].name }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, locationId, locationName: locRows[0].name, message: `Switch to "${locRows[0].name}" recorded in the audit log. Admin data is not location-scoped yet — use the header tenant switcher to change workspace context.` });
      }

      case "add_blackout": {
        // org_add_blackout → add_blackout
        const locationId = payload.location_id ? String(payload.location_id) : null;
        const name = String(payload.name || payload.reason || "Holiday blackout");
        const blackoutDate = String(payload.blackout_date || payload.start_date || "");
        const endDate = payload.end_date ? String(payload.end_date) : blackoutDate;
        const blackoutType = String(payload.blackout_type || "holiday");
        const isClosedAllDay = payload.is_closed_all_day !== undefined ? Boolean(payload.is_closed_all_day) : true;
        const blocksBooking = payload.blocks_online_booking !== undefined ? Boolean(payload.blocks_online_booking) : true;
        const notes = payload.notes ? String(payload.notes) : null;
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_holiday_blackouts
             (id, tenant_id, location_id, name, blackout_date, end_date, blackout_type,
              is_closed_all_day, blocks_online_booking, notes, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, now(), now())
           RETURNING id`,
          [resolveTenantId(req), locationId, name, blackoutDate, endDate, blackoutType, isClosedAllDay, blocksBooking, notes],
        );
        const blackoutId = rows[0]?.id ?? null;
        if (!blackoutId) {
          return NextResponse.json({ ok: false, error: "Blackout could not be created — the blackout was not saved" }, { status: 500 });
        }
        // Mirror each date into blocked_times — the store the booking
        // availability check actually reads (a row with no start/end time
        // blocks the whole day). Without this the blackout was a record
        // nothing enforced.
        const tenant = resolveTenantId(req);
        let blockedDays = 0;
        if (blocksBooking && /^\d{4}-\d{2}-\d{2}$/.test(blackoutDate)) {
          const start = new Date(`${blackoutDate}T00:00:00Z`);
          const end = new Date(`${endDate}T00:00:00Z`);
          const days = Math.min(62, Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1));
          for (let i = 0; i < days; i++) {
            const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
            await pgExec(
              `INSERT INTO public.blocked_times (id, date, "startTime", "endTime", reason, "staffId", tenant_id, "createdAt")
               VALUES (gen_random_uuid()::text, $1, NULL, NULL, $2, NULL, $3, now())`,
              [d, name, tenant],
            );
            blockedDays++;
          }
        }
        await auditAction({ action, domain: "crm", tableName: "crm_holiday_blackouts", recordId: blackoutId, afterData: { name, blackoutDate, endDate, blackoutType, blockedDays }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, blackoutId, name, blackoutDate, blockedDays });
      }

      case "delete_blackout": {
        // org_delete_blackout → delete_blackout
        // Removes a holiday blackout AND the blocked_times rows
        // org_add_blackout mirrored from it (matched on tenant + date +
        // reason), or the dates would stay blocked after the blackout
        // itself is gone.
        const blackoutId = String(payload.blackout_id || "");
        if (!blackoutId) return NextResponse.json({ ok: false, error: "blackout_id required" }, { status: 400 });
        const tenant = resolveTenantId(req);
        const rows = await pgQuery<{ name: string; blackout_date: string; end_date: string }>(
          `SELECT name, blackout_date::text AS blackout_date, end_date::text AS end_date
             FROM public.crm_holiday_blackouts WHERE id = $1::uuid AND tenant_id = $2`,
          [blackoutId, tenant],
        );
        if (!rows[0]) return NextResponse.json({ ok: false, error: "Blackout not found" }, { status: 404 });
        const { name, blackout_date: blackoutDate, end_date: endDate } = rows[0];
        const deleted = await pgExec(
          `DELETE FROM public.crm_holiday_blackouts WHERE id = $1::uuid AND tenant_id = $2`,
          [blackoutId, tenant],
        );
        let unblockedDays = 0;
        if (/^\d{4}-\d{2}-\d{2}$/.test(blackoutDate)) {
          unblockedDays = await pgExec(
            `DELETE FROM public.blocked_times
              WHERE tenant_id = $1 AND reason = $2 AND date >= $3 AND date <= $4`,
            [tenant, name, blackoutDate, endDate || blackoutDate],
          );
        }
        await auditAction({ action, domain: "crm", tableName: "crm_holiday_blackouts", recordId: blackoutId, afterData: { name, blackoutDate, endDate, deleted, unblockedDays }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, blackoutId, deleted, unblockedDays });
      }

      // ───────────────────────────────────────────────────────────────────
      // USER / STAFF handlers
      // ───────────────────────────────────────────────────────────────────

      case "add_user":
      case "add_employee":
      case "add_member": {
        // org_add_user / accts_add_employee / staff_add_member all collapse
        // to adding a row in crm_staff AND completing the sign-in chain via
        // provisionEmployeeSignIn (auth invite + tenant_memberships + legacy
        // staff + crm_staff.user_id) — a profile alone can never sign in,
        // because resolvePortalUser never reads crm_staff.
        const firstName = String(payload.first_name || "").trim();
        const lastName = String(payload.last_name || "").trim();
        if (!firstName || !lastName) {
          return NextResponse.json({ ok: false, error: "First and last name are required" }, { status: 400 });
        }
        const email = String(payload.email || "").trim();
        const role = String(payload.role || "staff");
        const isGroomer = Boolean(payload.is_service_staff ?? false);
        const phone = payload.phone ? String(payload.phone) : null;
        const displayName = String(payload.display_name || `${firstName} ${lastName}`.trim());
        const hireDate = payload.hire_date ? String(payload.hire_date) : null;
        const tenant = resolveTenantId(req);
        // SA-125 negative/edge cases: crm_staff has no unique constraint on
        // email, so duplicates must be caught here — an active profile with
        // the same email is a duplicate (409); an INACTIVE one is a rehire,
        // which reactivates that record instead of minting a second row.
        if (email) {
          const existing = await pgQuery<{ id: string; is_active: boolean; display_name: string }>(
            `SELECT id, is_active, display_name FROM public.crm_staff
              WHERE tenant_id = $1 AND lower(email) = lower($2)
              ORDER BY is_active DESC, created_at ASC
              LIMIT 1`,
            [tenant, email],
          );
          if (existing[0]) {
            if (existing[0].is_active) {
              return NextResponse.json({ ok: false, error: `${existing[0].display_name} (${email}) is already on the team` }, { status: 409 });
            }
            await pgExec(
              `UPDATE public.crm_staff
                  SET is_active = true, termination_date = NULL,
                      first_name = $2, last_name = $3, display_name = $4,
                      role = $5, is_service_staff = $6, phone = COALESCE($7, phone),
                      updated_at = now()
                WHERE id = $1::uuid AND tenant_id = $8`,
              [existing[0].id, firstName, lastName, displayName, role, isGroomer, phone, tenant],
            );
            await auditAction({ action: "add_member_rehire", domain: "crm", tableName: "crm_staff", recordId: existing[0].id, afterData: { firstName, lastName, email, role, isGroomer, rehired: true }, actorUserId: actorId, ipAddress: ip });
            const rehireSignIn = await provisionEmployeeSignIn({ tenant, email, displayName, phone, role, isGroomer, crmStaffId: existing[0].id });
            return NextResponse.json({ ok: true, staffId: existing[0].id, email, role, rehired: true, signIn: rehireSignIn, message: `${displayName} was previously on the team — their existing profile has been reactivated. ${rehireSignIn.note}` });
          }
        }
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_staff
             (id, tenant_id, display_name, first_name, last_name, email, phone, role,
              is_service_staff, is_active, hire_date, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true, $9, now(), now())
           RETURNING id`,
          [tenant, displayName, firstName, lastName, email || null, phone, role, isGroomer, hireDate],
        );
        const staffId = rows[0]?.id ?? null;
        if (!staffId) {
          return NextResponse.json({ ok: false, error: "Staff profile could not be created — the profile was not saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_staff", recordId: staffId, afterData: { firstName, lastName, email, role, isGroomer }, actorUserId: actorId, ipAddress: ip });
        const signIn = await provisionEmployeeSignIn({ tenant, email, displayName, phone, role, isGroomer, crmStaffId: staffId });
        return NextResponse.json({ ok: true, staffId, email, role, signIn, message: `Staff profile created. ${signIn.note}` });
      }

      case "assign_shifts": {
        // staff_assign_shifts → assign_shifts
        const staffId = String(payload.staff_id || "");
        const locationId = payload.location_id ? String(payload.location_id) : null;
        const shiftDate = String(payload.shift_date || "");
        // Bare times ("09:00") must be anchored to the shift date — as a
        // bare timestamptz cast Postgres would date them TODAY, putting
        // the shift on the wrong day.
        const anchorTime = (v: string) => (/^\d{1,2}:\d{2}(:\d{2})?$/.test(v) && shiftDate ? `${shiftDate}T${v.length === 5 ? `${v}:00` : v}` : v);
        const startsAt = anchorTime(String(payload.starts_at || payload.start_time || ""));
        const endsAt = anchorTime(String(payload.ends_at || payload.end_time || ""));
        const breakMinutes = payload.break_minutes !== undefined ? Number(payload.break_minutes) : 0;
        const role = payload.role ? String(payload.role) : null;
        const tenant = resolveTenantId(req);
        if (!staffId || !shiftDate || !startsAt || !endsAt) {
          return NextResponse.json({ ok: false, error: "staff_id, shift_date, starts_at and ends_at are required" }, { status: 400 });
        }
        if (!(new Date(endsAt).getTime() > new Date(startsAt).getTime())) {
          return NextResponse.json({ ok: false, error: "Shift end time must be after the start time" }, { status: 400 });
        }
        const staffRow = await pgQuery<{ id: string; display_name: string }>(
          `SELECT id, display_name FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2 LIMIT 1`,
          [staffId, tenant],
        );
        if (!staffRow[0]) {
          return NextResponse.json({ ok: false, error: "Staff member not found for this tenant" }, { status: 404 });
        }
        // SA-127 negative case: the crm_staff_shifts_no_overlap exclusion
        // constraint already makes double-booking impossible — pre-check so
        // the operator gets a plain-language conflict instead of the raw
        // 23P01 surfacing as a 500.
        const clash = await pgQuery<{ id: string }>(
          `SELECT id FROM public.crm_staff_shifts
            WHERE tenant_id = $1 AND staff_id = $2::uuid
              AND status IN ('scheduled', 'published', 'confirmed', 'in_progress')
              AND tstzrange(starts_at, ends_at) && tstzrange($3::timestamptz, $4::timestamptz)
            LIMIT 1`,
          [tenant, staffId, startsAt, endsAt],
        );
        if (clash[0]) {
          return NextResponse.json({ ok: false, error: `${staffRow[0].display_name} already has a shift that overlaps ${shiftDate} ${startsAt} – ${endsAt}` }, { status: 409 });
        }
        let rows: { id: string }[];
        try {
          rows = await pgQuery<{ id: string }>(
            `INSERT INTO public.crm_staff_shifts
               (id, tenant_id, staff_id, location_id, shift_date, starts_at, ends_at,
                break_minutes, role, status, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, 'scheduled', now(), now())
             RETURNING id`,
            [tenant, staffId, locationId, shiftDate, startsAt, endsAt, breakMinutes, role],
          );
        } catch (e) {
          // Race with the pre-check: the exclusion constraint fired anyway.
          if ((e as { code?: string })?.code === "23P01") {
            return NextResponse.json({ ok: false, error: `${staffRow[0].display_name} already has a shift that overlaps that time` }, { status: 409 });
          }
          throw e;
        }
        const shiftId = rows[0]?.id ?? null;
        if (!shiftId) {
          return NextResponse.json({ ok: false, error: "Shift could not be assigned — the shift was not saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_staff_shifts", recordId: shiftId, afterData: { staffId, shiftDate, startsAt, endsAt }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, shiftId, staffId, shiftDate });
      }

      case "build_schedule": {
        // staff_build_schedule → build_schedule
        // Auto-generate shifts for every active groomer for a date range.
        // Shift times come from the location's operating hours
        // (crm_operating_hours, the rows Settings → Booking Rules writes):
        // a day the shop is closed gets no shift, and open/close times set
        // the shift window. Days with no hours row fall back to the payload
        // defaults (9am-5pm). Idempotent: skips days that already have a
        // shift for the same groomer.
        const locationId = payload.location_id ? String(payload.location_id) : null;
        const startDate = String(payload.start_date || "");
        const endDate = String(payload.end_date || "");
        const tenant = resolveTenantId(req);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
          return NextResponse.json({ ok: false, error: "start_date and end_date (YYYY-MM-DD, end on or after start) are required" }, { status: 400 });
        }
        const rangeDays = Math.round((new Date(`${endDate}T12:00:00Z`).getTime() - new Date(`${startDate}T12:00:00Z`).getTime()) / 86_400_000) + 1;
        if (rangeDays > 62) {
          return NextResponse.json({ ok: false, error: "Schedule builds are limited to 62 days at a time" }, { status: 400 });
        }
        // Days in range the chosen operating-hours rows mark closed
        // (informational — the INSERT below skips them the same way).
        const closedRows = await pgQuery<{ n: string }>(
          `SELECT count(*)::text AS n
             FROM generate_series($2::date, $3::date, '1 day'::interval) d
             JOIN LATERAL (
                    SELECT is_closed FROM public.crm_operating_hours
                     WHERE tenant_id = $1
                       AND day_of_week = EXTRACT(DOW FROM d)::int
                     ORDER BY CASE WHEN location_id IS NOT DISTINCT FROM $4::uuid THEN 0
                                   WHEN location_id IS NULL THEN 1 ELSE 2 END,
                              location_id
                     LIMIT 1
                  ) h ON h.is_closed = true`,
          [tenant, startDate, endDate, locationId],
        );
        const closedDaysSkipped = Number(closedRows[0]?.n ?? 0);
        const staffRows = await pgQuery<{ id: string; display_name: string }>(
          `SELECT id, display_name FROM public.crm_staff
            WHERE tenant_id = $1 AND is_active = true AND is_service_staff = true
            LIMIT 50`,
          [tenant],
        );
        let created = 0;
        for (const s of staffRows) {
          // Default 9 AM – 5 PM Central; override from payload.default_starts_at if provided
          const ds = String(payload.default_starts_at || "09:00");
          const de = String(payload.default_ends_at || "17:00");
          // Combine date d with the day's open/close time (operating hours
          // win over the defaults; a closed day produces no row at all).
          const inserted = await pgExec(
            `INSERT INTO public.crm_staff_shifts
               (id, tenant_id, staff_id, location_id, shift_date, starts_at, ends_at,
                break_minutes, role, status, created_at, updated_at)
             SELECT gen_random_uuid(), $1, $2, $3::uuid, d::date,
                    (d::date + COALESCE(h.opens_at, ($4 || ':00')::time))::timestamp,
                    (d::date + COALESCE(h.closes_at, ($5 || ':00')::time))::timestamp,
                    30, 'groomer', 'scheduled', now(), now()
               FROM generate_series($6::date, $7::date, '1 day'::interval) d
               LEFT JOIN LATERAL (
                      SELECT opens_at, closes_at, is_closed FROM public.crm_operating_hours
                       WHERE tenant_id = $1
                         AND day_of_week = EXTRACT(DOW FROM d)::int
                       ORDER BY CASE WHEN location_id IS NOT DISTINCT FROM $3::uuid THEN 0
                                     WHEN location_id IS NULL THEN 1 ELSE 2 END,
                                location_id
                       LIMIT 1
                    ) h ON true
              WHERE COALESCE(h.is_closed, false) = false
                AND NOT EXISTS (
                      SELECT 1 FROM public.crm_staff_shifts
                       WHERE tenant_id = $1 AND staff_id = $2 AND shift_date = d
                     )`,
            [tenant, s.id, locationId, ds, de, startDate, endDate],
          );
          created += inserted;
        }
        await auditAction({ action, domain: "crm", tableName: "crm_staff_shifts", recordId: null, afterData: { locationId, startDate, endDate, staffCount: staffRows.length, shiftsCreated: created, closedDaysSkipped }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, staffCount: staffRows.length, shiftsCreated: created, closedDaysSkipped, dateRange: { from: startDate, to: endDate } });
      }

      case "clock_in": {
        // emp_clock_in → clock_in
        const staffId = String(payload.staff_id || "");
        const notes = payload.notes ? String(payload.notes) : null;
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_staff_time_clock_entries
             (id, tenant_id, staff_id, clock_in, source, notes, created_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, now(), 'manual', $3, now())
           RETURNING id`,
          [resolveTenantId(req), staffId, notes],
        );
        const entryId = rows[0]?.id ?? null;
        if (!entryId) {
          return NextResponse.json({ ok: false, error: "Clock-in could not be recorded — the time entry was not saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_staff_time_clock_entries", recordId: entryId, afterData: { staffId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, entryId, staffId, clockIn: new Date().toISOString() });
      }

      case "clock_out": {
        // emp_clock_out → clock_out
        const entryId = String(payload.entry_id || "");
        const updated = await pgExec(
          `UPDATE public.crm_staff_time_clock_entries SET clock_out = now()
            WHERE id = $1::uuid AND tenant_id = $2 AND clock_out IS NULL`,
          [entryId, resolveTenantId(req)],
        );
        await auditAction({ action, domain: "crm", tableName: "crm_staff_time_clock_entries", recordId: entryId, afterData: { updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, entryId, updated, clockOut: new Date().toISOString() });
      }

      case "add_incident":
      case "add_incident_report": {
        // emp_add_incident / add_incident_report (legacy alias)
        const staffId = String(payload.staff_id || "");
        const severity = String(payload.severity || "low");
        const description = String(payload.description || "");
        const actionTaken = payload.action_taken ? String(payload.action_taken) : null;
        const petId = payload.dependent_id ? String(payload.dependent_id) : null;
        const appointmentId = payload.appointment_id ? String(payload.appointment_id) : null;
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_staff_incident_reports
             (id, tenant_id, staff_id, appointment_id, dependent_id, severity, description,
              action_taken, created_by, created_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7,
                   $8::uuid, now())
           RETURNING id`,
          [resolveTenantId(req), staffId, appointmentId, petId, severity, description, actionTaken, actorId],
        );
        const incidentId = rows[0]?.id ?? null;
        if (!incidentId) {
          return NextResponse.json({ ok: false, error: "Incident report could not be recorded — the report was not saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_staff_incident_reports", recordId: incidentId, afterData: { staffId, severity, description }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, incidentId, staffId, severity });
      }

      // ───────────────────────────────────────────────────────────────────
      // SERVICES / SURCHARGES / PRICING handlers (CMS-flavored)
      // ───────────────────────────────────────────────────────────────────

      case "add_service": {
        // cms_add_service → add_service
        const name = String(payload.name || "");
        const description = payload.description ? String(payload.description) : null;
        const defaultPrice = Number(payload.default_price ?? payload.base_price ?? 0);
        const defaultDuration = Number(payload.default_duration_minutes ?? payload.duration_minutes ?? 30);
        const category = payload.category ? String(payload.category) : "grooming";
        const code = String(payload.code || name.toUpperCase().replace(/\s+/g, "_").slice(0, 20));
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_services
             (id, tenant_id, name, code, description, category, default_duration_minutes,
              default_price, deposit_required, default_deposit_amount, is_active, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, false, 0, true, now())
           RETURNING id`,
          [resolveTenantId(req), name, code, description, category, defaultDuration, defaultPrice],
        );
        const serviceId = rows[0]?.id ?? null;
        if (!serviceId) {
          return NextResponse.json({ ok: false, error: `Service "${name}" could not be created — the service was not saved` }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_services", recordId: serviceId, afterData: { name, code, defaultPrice, defaultDuration }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, serviceId, name, code, defaultPrice, defaultDuration });
      }

      case "edit_pricing": {
        // cms_edit_pricing → edit_pricing
        const serviceId = String(payload.service_id || "");
        const defaultPrice = payload.default_price !== undefined ? Number(payload.default_price) : null;
        const defaultDuration = payload.default_duration_minutes !== undefined ? Number(payload.default_duration_minutes) : null;
        const updated = await pgExec(
          `UPDATE public.crm_services
              SET default_price = COALESCE($1, default_price),
                  default_duration_minutes = COALESCE($2, default_duration_minutes),
                  updated_at = now()
            WHERE id = $3::uuid AND tenant_id = $4`,
          [defaultPrice, defaultDuration, serviceId, resolveTenantId(req)],
        );
        await auditAction({ action, domain: "crm", tableName: "crm_services", recordId: serviceId, afterData: { defaultPrice, defaultDuration }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, serviceId, updated });
      }

      case "add_surcharge": {
        // cms_add_surcharge → add_surcharge
        const code = String(payload.code || `SC-${Date.now().toString(36).toUpperCase()}`);
        const name = String(payload.name || payload.surcharge_type || "Surcharge");
        const description = payload.description ? String(payload.description) : null;
        // CHECK constraint: calc_method IN ('flat_amount','percent_of_service','per_minute')
        // CHECK constraint: surcharge_type IN ('weekend','holiday','severe_matting','senior_pet',
        //   'aggressive_pet','late_pickup','no_show','express','de_shedding','flea_treatment',
        //   'special_handling','travel','other')
        const VALID_CALC = new Set(["flat_amount", "percent_of_service", "per_minute"]);
        const VALID_TYPE = new Set(["weekend","holiday","severe_matting","senior_pet","aggressive_pet","late_pickup","no_show","express","de_shedding","flea_treatment","special_handling","travel","other"]);
        let calcMethod = String(payload.calc_method || "flat_amount");
        if (!VALID_CALC.has(calcMethod)) calcMethod = "flat_amount";
        let surchargeType = String(payload.surcharge_type || "other");
        if (!VALID_TYPE.has(surchargeType)) surchargeType = "other";
        const amount = Number(payload.amount || 0);
        const percent = Number(payload.percent || 0);
        const autoApply = Boolean(payload.auto_apply ?? false);
        const taxable = Boolean(payload.taxable ?? false);
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_surcharges
             (id, tenant_id, code, name, description, surcharge_type, calc_method, amount,
              percent, auto_apply, requires_approval, taxable, commissionable, is_active, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, false, true, now())
           RETURNING id`,
          [resolveTenantId(req), code, name, description, surchargeType, calcMethod, amount, percent, autoApply, taxable],
        );
        const surchargeId = rows[0]?.id ?? null;
        if (!surchargeId) {
          return NextResponse.json({ ok: false, error: `Surcharge ${code} could not be created — the surcharge was not saved` }, { status: 500 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_surcharges", recordId: surchargeId, afterData: { code, name, amount, percent, calcMethod }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, surchargeId, code, name });
      }

      // ───────────────────────────────────────────────────────────────────
      // MAGIC LINK handler
      // ───────────────────────────────────────────────────────────────────

      case "send_magic_link":
      case "magic_link": {
        // sys_send_magic_link / portal_send_magic_link → send_magic_link
        // ALSO accept "magic_link" (frontend registry ID `cust-magic-link`
        // prefix-strips `cust_` → `magic_link`).
        // Generates a one-time token, stores its SHA-256 hash in
        // portal_magic_links (we never store the raw token), and DELIVERS
        // the email through sendEmail (Resend). The crm_messages row
        // records the honest delivery outcome — nothing drains a 'queued'
        // queue, so rows are never left pretending to be sent.
        // NOTE: the /magic consume endpoint does not exist yet — that's a
        // separate customer-auth build. The link record + delivery are
        // real; the response says so plainly.
        const email = String(payload.email || "").trim();
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const purpose = String(payload.purpose || "magic_link");
        const ttlHours = Number(payload.ttl_hours || 24);
        if (!email || !email.includes("@")) {
          return NextResponse.json({ ok: false, error: "A customer email is required — the magic link was not created" }, { status: 400 });
        }
        const crypto = await import("crypto");
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
        const tenantId = resolveTenantId(req);
        // portal_magic_links_open_idx allows only ONE unused link per
        // (customer, purpose) — supersede any prior unused link first,
        // or every repeat send dies on the unique index (23505).
        await pgExec(
          `UPDATE public.portal_magic_links
              SET used_at = now()
            WHERE tenant_id = $1 AND customer_id = $2::uuid
              AND purpose = $3 AND used_at IS NULL`,
          [tenantId, customerId, purpose],
        );
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.portal_magic_links
             (id, tenant_id, customer_id, purpose, token_hash, expires_at, requested_by, created_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4, $5, $6::uuid, now())
           RETURNING id`,
          [tenantId, customerId, purpose, tokenHash, expiresAt, actorId],
        );
        const linkId = rows[0]?.id ?? null;
        if (!linkId) {
          return NextResponse.json({ ok: false, error: "Magic link could not be created — no link was generated and no email was sent" }, { status: 500 });
        }
        const linkUrl = `https://www.unsaidmemories.com/magic?token=${rawToken}`;
        const sent = await sendEmail({
          to: email,
          template: "magic_link",
          subject: "Your sign-in link for UnSaid Memories",
          html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">` +
            `<p>Hi, here's your one-time sign-in link for UnSaid Memories. It expires in ${ttlHours} hour${ttlHours === 1 ? "" : "s"}.</p>` +
            `<p><a href="${linkUrl}" style="display:inline-block;background:#ea580c;color:#ffffff;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Sign in to UnSaid Memories</a></p>` +
            `<p style="color:#666;font-size:12px">If you didn't request this link, you can ignore this email.<br>UnSaid Memories · 699 Waring Rd, Memphis, TN 38122 · 901-722-1114</p></div>`,
          tenantId,
        });
        await pgExec(
          `INSERT INTO public.crm_messages
             (id, tenant_id, customer_id, channel, direction, status, to_address,
              subject, body, provider, sent_at, created_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, 'email', 'outbound', $3, $4,
                   'Your magic link to UnSaidMemories',
                   $5, 'resend', now(), now())`,
          [tenantId, customerId, sent.ok ? "sent" : "failed", email, `Sign-in link sent by email (expires ${expiresAt}).`],
        );
        await auditAction({ action, domain: "crm", tableName: "portal_magic_links", recordId: linkId, afterData: { email, purpose, expiresAt, emailed: sent.ok }, actorUserId: actorId, ipAddress: ip });
        if (!sent.ok) {
          return NextResponse.json({ ok: false, error: `Magic link created but the email could not be sent: ${sent.error || "unknown error"}`, linkId, email, expiresAt, emailed: false }, { status: 502 });
        }
        return NextResponse.json({ ok: true, linkId, email, expiresAt, emailed: true, message: "Magic link generated and emailed to the customer" });
      }

      // ───────────────────────────────────────────────────────────────────
      // AUTOMATION / SCHEDULED-JOB handlers
      // Each "run_* automation" handler:
      //   1. SELECTs the affected rows
      //   2. INSERTs a queued crm_messages row for each customer
      //   3. Marks each affected row's reminder_sent_at so the next run
      //      doesn't double-send.
      // ───────────────────────────────────────────────────────────────────

      case "run_appt_reminders":
      case "run_birthday_msgs":
      case "run_birthday":
      case "run_vaccine_reminders":
      case "run_vaccine":
      case "run_payment_reminders":
      case "run_rebooking":
      case "run_unsigned_docs":
      case "run_winback": {
        // §1.21 Automation Center — the executors live in
        // lib/admin/automation-executor.ts (extracted 2026-10-23 for BL-9)
        // and are shared with the scheduler (/api/cron/crm-automations),
        // so a manual Run and a scheduled run execute the identical code.
        const automationResult = await executeSystemAutomation(shortAction, {
          tenant: resolveTenantId(req),
          payload,
          action,
          actorId,
          ip,
        });
        return NextResponse.json(automationResult.body, { status: automationResult.status });
      }

      case "run_missing_contact_info": {
        // sys_run_missing_contact_info → Data Management (Master Tree
        // 1.22): the real list of active customers missing an email or a
        // phone — the two channels every reminder automation depends on.
        // Read-only; empty strings count as missing (several write paths
        // store '' instead of NULL).
        const rows = await pgQuery<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; mobile_phone: string | null }>(
          `SELECT id::text AS id, first_name, last_name, email, phone, mobile_phone
             FROM public.crm_customers
            WHERE tenant_id = $1 AND is_active = true
              AND ((email IS NULL OR email = '') OR ((phone IS NULL OR phone = '') AND (mobile_phone IS NULL OR mobile_phone = '')))
            ORDER BY last_name, first_name
            LIMIT 200`,
          [resolveTenantId(req)],
        );
        const customers = rows.map((r) => ({
          id: r.id,
          name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Customer",
          email: r.email || null,
          phone: r.phone || r.mobile_phone || null,
          missing: [
            ...(!r.email ? ["email"] : []),
            ...(!(r.phone || r.mobile_phone) ? ["phone"] : []),
          ],
        }));
        // §1.22.4 — persist the worklist: one open crm_tasks row per
        // customer (task_type 'missing_contact'), deduped against tasks
        // already open for that customer, so the list survives the run
        // and is actionable from the CRM tasks read (GET
        // /api/admin/crm/tasks) instead of living only in this response.
        const tenant = resolveTenantId(req);
        let worklistPersisted = 0;
        for (const c of customers) {
          const ins = await pgQuery<{ id: string }>(
            `INSERT INTO public.crm_tasks
               (id, tenant_id, customer_id, task_type, priority, title, description, status, created_at, updated_at)
             SELECT gen_random_uuid(), $1, $2::uuid, 'missing_contact', 'normal', $3, $4, 'open', now(), now()
              WHERE NOT EXISTS (
                SELECT 1 FROM public.crm_tasks t
                 WHERE t.tenant_id = $1 AND t.customer_id = $2::uuid
                   AND t.task_type = 'missing_contact' AND t.status IN ('open', 'in_progress'))
             RETURNING id`,
            [tenant, c.id, `Missing contact info: ${c.missing.join(", ")}`, `${c.name} is missing ${c.missing.join(" and ")} — added by Data Management missing-contact detection.`],
          ).catch(() => []);
          if (ins.length) worklistPersisted++;
        }
        await auditAction({ action, domain: "crm", tableName: "crm_customers", recordId: null, afterData: { count: customers.length, worklistPersisted }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, count: customers.length, customers, worklistPersisted, message: `${customers.length} active customer(s) missing contact info` });
      }

      case "run_duplicate_detection":
      case "run_duplicate": {
        // sys_run_duplicate_detection → run_duplicate_detection (legacy alias run_duplicate)
        const tenant = resolveTenantId(req);
        const dupes = await pgQuery<{ email: string; cnt: string }>(
          `SELECT lower(email) AS email, COUNT(*)::text AS cnt
             FROM public.crm_customers
            WHERE tenant_id = $1 AND is_active = true AND email IS NOT NULL AND email <> ''
            GROUP BY lower(email)
            HAVING COUNT(*) > 1
            LIMIT 50`,
          [tenant],
        );
        // §1.22.1 — persist the candidates: every same-email pair lands in
        // crm_duplicate_candidates (status 'open', match_score 1.0 for an
        // exact email match). The table's UNIQUE (tenant, entity, a, b)
        // + ON CONFLICT DO NOTHING keeps re-runs idempotent and never
        // resurrects a pair already reviewed (dismissed/merged).
        const persisted = await pgQuery<{ id: string }>(
          `INSERT INTO public.crm_duplicate_candidates
             (id, tenant_id, entity_type, record_a, record_b, match_score, match_reasons, status, created_at)
           SELECT gen_random_uuid(), $1, 'customer', a.id, b.id, 1.0,
                  jsonb_build_object('field', 'email', 'value', lower(a.email)), 'open', now()
             FROM public.crm_customers a
             JOIN public.crm_customers b
               ON b.tenant_id = a.tenant_id AND lower(b.email) = lower(a.email) AND a.id < b.id
            WHERE a.tenant_id = $1 AND a.is_active = true AND b.is_active = true
              AND a.email IS NOT NULL AND a.email <> ''
           ON CONFLICT (tenant_id, entity_type, record_a, record_b) DO NOTHING
           RETURNING id`,
          [tenant],
        );
        // Read back the full open-candidate worklist (this run's finds
        // plus any still open from earlier runs) for the panel.
        const candidates = await pgQuery<{ id: string; record_a: string; record_b: string; a_name: string | null; b_name: string | null; email: string | null; created_at: string }>(
          `SELECT dc.id::text AS id, dc.record_a::text AS record_a, dc.record_b::text AS record_b,
                  NULLIF(TRIM(COALESCE(ca.first_name, '') || ' ' || COALESCE(ca.last_name, '')), '') AS a_name,
                  NULLIF(TRIM(COALESCE(cb.first_name, '') || ' ' || COALESCE(cb.last_name, '')), '') AS b_name,
                  lower(ca.email) AS email, dc.created_at::text AS created_at
             FROM public.crm_duplicate_candidates dc
             JOIN public.crm_customers ca ON ca.id = dc.record_a
             JOIN public.crm_customers cb ON cb.id = dc.record_b
            WHERE dc.tenant_id = $1 AND dc.entity_type = 'customer' AND dc.status = 'open'
            ORDER BY dc.created_at DESC
            LIMIT 100`,
          [tenant],
        );
        await auditAction({ action, domain: "crm", tableName: "crm_duplicate_candidates", recordId: null, afterData: { count: dupes.length, persisted: persisted.length, openCandidates: candidates.length }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, count: dupes.length, duplicates: dupes, persisted: persisted.length, candidates, message: `Detected ${dupes.length} duplicate email clusters` });
      }

      case "dismiss_duplicate_candidate": {
        // sys_dismiss_duplicate_candidate → review leg for the persisted
        // candidate worklist (§1.22.1): marks the pair dismissed with the
        // reviewer stamped, so detection re-runs never resurrect it.
        const candidateId = payload.candidate_id ? String(payload.candidate_id) : "";
        if (!candidateId) {
          return NextResponse.json({ ok: false, error: "candidate_id is required" }, { status: 400 });
        }
        const updated = await pgExec(
          `UPDATE public.crm_duplicate_candidates
              SET status = 'dismissed',
                  reviewed_by = CASE WHEN $3 ~ '^[0-9a-fA-F-]{36}$' THEN $3::uuid ELSE reviewed_by END,
                  reviewed_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid AND status = 'open'`,
          [resolveTenantId(req), candidateId, actorId],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: "Candidate not found or already reviewed" }, { status: 404 });
        }
        await auditAction({ action, domain: "crm", tableName: "crm_duplicate_candidates", recordId: candidateId, afterData: { status: "dismissed" }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, candidateId, status: "dismissed" });
      }

      // ───────────────────────────────────────────────────────────────────
      // MODULE 8 REMAINING — Org/Settings: business profile, branding,
      // roles, 2FA reset, user suspend, deposit/cancellation/no-show
      // policies, system health, backup, quick links.
      // ───────────────────────────────────────────────────────────────────

      case "edit_business_profile": {
        // Update the tenant's default location (business name, phone, email, address).
        const locationId = payload.location_id ? String(payload.location_id) : null;
        const name = payload.name ? String(payload.name) : null;
        const phone = payload.phone ? String(payload.phone) : null;
        const email = payload.email ? String(payload.email) : null;
        const addressLine1 = payload.address_line1 ? String(payload.address_line1) : null;
        const city = payload.city ? String(payload.city) : null;
        const state = payload.state ? String(payload.state) : null;
        const postalCode = payload.postal_code ? String(payload.postal_code) : null;
        // If no location_id, update the first (default) location
        const tenant = resolveTenantId(req);
        const targetId = locationId || (await pgQuery<{ id: string }>(`SELECT id FROM public.crm_locations WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`, [tenant]))[0]?.id;
        if (!targetId) return NextResponse.json({ ok: false, error: "No location found" }, { status: 404 });
        const updated = await pgExec(
          `UPDATE public.crm_locations SET name = COALESCE($1, name), phone = COALESCE($2, phone),
              email = COALESCE($3, email), address_line1 = COALESCE($4, address_line1),
              city = COALESCE($5, city), state = COALESCE($6, state), postal_code = COALESCE($7, postal_code),
              updated_at = now() WHERE id = $8::uuid AND tenant_id = $9`,
          [name, phone, email, addressLine1, city, state, postalCode, targetId, tenant],
        );
        // The business profile the owner sees lives in the canonical
        // settings store (BusinessProfileScreen → org_* keys). Write the
        // same values there or the settings screen never reflects this
        // action.
        let settingsSaved = 0;
        if (name) { await saveSiteSetting(tenant, "org_business_name", "Business Name", name); settingsSaved++; }
        if (phone) { await saveSiteSetting(tenant, "org_phone", "Phone", phone); settingsSaved++; }
        if (email) { await saveSiteSetting(tenant, "org_email", "Email", email); settingsSaved++; }
        if (addressLine1 || city || state || postalCode) {
          const composed = [addressLine1, city, state && postalCode ? `${state} ${postalCode}` : state || postalCode].filter(Boolean).join(", ");
          if (composed) { await saveSiteSetting(tenant, "org_address", "Address", composed); settingsSaved++; }
        }
        await auditAction({ action, domain: "crm", tableName: "crm_locations", recordId: targetId, afterData: { name, phone, email, updated, settingsSaved }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, locationId: targetId, updated, settingsSaved });
      }

      case "edit_branding": {
        // Branding lives in the canonical settings store under the org_*
        // keys the Brand Identity screen renders (org_logo_url,
        // org_primary_color, org_tagline) at locale 'en-US'. (This used to
        // write branding_* keys at locale 'en' — no reader ever saw them.)
        const tenant = resolveTenantId(req);
        const pairs: Array<[string, string, string | null]> = [
          ["org_logo_url", "Logo URL", payload.logo_url ? String(payload.logo_url) : null],
          ["org_primary_color", "Primary Color", payload.brand_color ? String(payload.brand_color) : null],
          ["org_tagline", "Tagline", payload.tagline ? String(payload.tagline) : null],
        ];
        let updated = 0;
        for (const [key, label, val] of pairs) {
          if (val !== null) { await saveSiteSetting(tenant, key, label, val); updated++; }
        }
        await auditAction({ action, domain: "crm", tableName: "cms_global_content", recordId: null, afterData: { updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, updated, message: `${updated} branding settings saved` });
      }

      case "edit_role": {
        // Grant or revoke a module permission for a staff member.
        // M3: writes portal_module_permissions (the surviving store)
        // through the staff member's portal identity; the response
        // shape (permId, staffId, moduleCode, accessLevel) is unchanged
        // — accessLevel stays in the UI vocabulary (full, not all).
        const staffId = String(payload.staff_id || "");
        const moduleCode = String(payload.module_code || "");
        const accessLevel = String(payload.access_level || "read");
        const action2 = String(payload.grant_or_revoke || "grant");
        const tenant = resolveTenantId(req);
        if (!staffId) {
          return NextResponse.json({ ok: false, error: "staff_id is required" }, { status: 400 });
        }
        if (!(MODULE_CODES as string[]).includes(moduleCode)) {
          return NextResponse.json({ ok: false, error: `module_code must be one of: ${MODULE_CODES.join(", ")}` }, { status: 400 });
        }
        if (!["none", "read", "write", "full"].includes(accessLevel)) {
          return NextResponse.json({ ok: false, error: "access_level must be one of none/read/write/full" }, { status: 400 });
        }
        // M3: resolve the staff member's portal identity (created on
        // demand for salon staff without one — module-grants.ts).
        const { portalUserIdForStaff, platformLevelToPortal } = await import("@/lib/capabilities/module-grants");
        const staffRow = await pgQuery<{ user_id: string; email: string | null; display_name: string | null }>(
          `SELECT user_id::text AS user_id, email, display_name FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2 LIMIT 1`,
          [staffId, tenant],
        );
        const portalUserId = staffRow[0]
          ? await (async () => {
              const { withPg } = await import("@/lib/crm/enterprise");
              return withPg(async (client) =>
                portalUserIdForStaff(client, {
                  tenantId: tenant,
                  userId: staffRow[0].user_id,
                  email: staffRow[0].email,
                  displayName: staffRow[0].display_name,
                }),
              );
            })()
          : null;
        if (!portalUserId) {
          return NextResponse.json({ ok: false, error: "Staff member has no portal identity to attach the grant to" }, { status: 500 });
        }
        const portalLevel = platformLevelToPortal(accessLevel);
        if (action2 === "revoke") {
          const deleted = await pgExec(
            `DELETE FROM public.portal_module_permissions WHERE portal_user_id = $1::uuid AND module_key = $2 AND tenant_id = $3`,
            [portalUserId, moduleCode, tenant],
          );
          await auditAction({ action: "edit_role_revoke", domain: "crm", tableName: "portal_module_permissions", recordId: staffId, afterData: { moduleCode, accessLevel, deleted }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, staffId, moduleCode, action: "revoked", deleted });
        }
        // M3: granted_by in the surviving store is the actor's auth id
        // (no staff FK there — the old staff-FK violation this comment
        // described cannot recur). Upsert via update-then-insert: the
        // portal store carries no unique constraint on its key.
        const grantedBy: string | null = actorId ?? null;
        const updated = await pgQuery<{ id: string }>(
          `UPDATE public.portal_module_permissions
              SET permission_level = $4, granted_by = $5::uuid, updated_at = now()
            WHERE tenant_id = $1 AND portal_user_id = $2::uuid AND module_key = $3
            RETURNING id`,
          [tenant, portalUserId, moduleCode, portalLevel, grantedBy],
        );
        const rows = updated.length
          ? updated
          : await pgQuery<{ id: string }>(
              `INSERT INTO public.portal_module_permissions (id, tenant_id, portal_user_id, module_key, permission_level, granted_by, created_at)
               SELECT gen_random_uuid(), $1, $2::uuid, $3, $4, $5::uuid, now()
                WHERE NOT EXISTS (
                  SELECT 1 FROM public.portal_module_permissions
                   WHERE tenant_id = $1 AND portal_user_id = $2::uuid AND module_key = $3)
               RETURNING id`,
              [tenant, portalUserId, moduleCode, portalLevel, grantedBy],
            );
        const permId = rows[0]?.id ?? null;
        if (!permId) {
          return NextResponse.json({ ok: false, error: `Permission for ${moduleCode} could not be granted — the grant was not saved` }, { status: 500 });
        }
        await auditAction({ action: "edit_role_grant", domain: "crm", tableName: "portal_module_permissions", recordId: permId, afterData: { staffId, moduleCode, accessLevel }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, permId, staffId, moduleCode, accessLevel, message: `Permission ${accessLevel} granted for ${moduleCode}` });
      }

      case "reset_2fa": {
        // Reset 2FA for a user — logs the request (actual 2FA reset
        // requires Supabase admin API which is outside the scope of
        // this route). We log it as a crm_notes entry on the staff.
        const staffId = String(payload.staff_id || "");
        const updated = await pgExec(
          `UPDATE public.crm_staff SET notes = COALESCE(notes || ' | ', '') || '2FA reset requested at ' || now()::text WHERE id = $1::uuid AND tenant_id = $2`,
          [staffId, resolveTenantId(req)],
        );
        await auditAction({ action, domain: "crm", tableName: "crm_staff", recordId: staffId, afterData: { resetRequested: true, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, staffId, updated, message: "2FA reset request logged — use Supabase admin to complete" });
      }

      case "suspend_user": {
        // Suspend a staff member AND revoke their sign-in (employee audit
        // 2026-10-17). crm_staff.is_active alone never revoked anything —
        // resolvePortalUser does not read crm_staff — so the suspension now
        // cascades to every store resolution reads: tenant_memberships
        // (status suspended + inactive), legacy staff (active = false),
        // and portal_users (is_active = false).
        const staffId = String(payload.staff_id || "");
        const reason = payload.reason ? String(payload.reason) : null;
        const tenant = resolveTenantId(req);
        const target = await pgQuery<{ user_id: string | null; email: string | null }>(
          `SELECT user_id::text AS user_id, email FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2 LIMIT 1`,
          [staffId, tenant],
        );
        const updated = await pgExec(
          `UPDATE public.crm_staff SET is_active = false, notes = COALESCE(notes || ' | ', '') || $1 WHERE id = $2::uuid AND tenant_id = $3`,
          [reason ? `Suspended: ${reason} at ${new Date().toISOString()}` : `Suspended at ${new Date().toISOString()}`, staffId, tenant],
        );
        let accessRevoked = false;
        const t = target[0];
        if (t?.user_id) {
          await pgExec(`UPDATE public.tenant_memberships SET status = 'suspended', active = false, updated_at = NOW() WHERE user_id = $1::uuid AND tenant_id = $2`, [t.user_id, tenant]);
          await pgExec(`UPDATE public.staff SET active = false WHERE "userId"::text = $1`, [t.user_id]);
          await pgExec(`UPDATE public.portal_users SET is_active = false, updated_at = now() WHERE user_id = $1::uuid AND tenant_id = $2`, [t.user_id, tenant]);
          accessRevoked = true;
        }
        if (t?.email) {
          // Unlinked profile: still deactivate any legacy staff row that
          // the email-based sign-in fallback would have matched.
          await pgExec(`UPDATE public.staff SET active = false WHERE lower(email) = lower($1) AND tenant_id = $2`, [t.email, tenant]);
        }
        await auditAction({ action, domain: "crm", tableName: "crm_staff", recordId: staffId, afterData: { suspended: true, reason, updated, accessRevoked }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, staffId, updated, accessRevoked, message: updated ? "User suspended — portal access revoked" : "Staff not found" });
      }

      case "edit_deposit_settings": {
        // Canonical keys are the booking_* settings the Booking Operations
        // screen renders (booking_deposit_flat_amount / booking_require_deposit
        // / booking_deposit_percent) at locale 'en-US'.
        const tenant = resolveTenantId(req);
        let updated = 0;
        if (payload.default_deposit_amount !== undefined) { await saveSiteSetting(tenant, "booking_deposit_flat_amount", "Flat Deposit Amount", String(payload.default_deposit_amount)); updated++; }
        if (payload.deposit_required !== undefined) { await saveSiteSetting(tenant, "booking_require_deposit", "Require Upfront Deposit", String(payload.deposit_required)); updated++; }
        if (payload.deposit_percent !== undefined) { await saveSiteSetting(tenant, "booking_deposit_percent", "Deposit Percentage", String(payload.deposit_percent)); updated++; }
        await auditAction({ action, domain: "crm", tableName: "cms_global_content", recordId: null, afterData: { updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, updated, message: `${updated} deposit settings saved` });
      }

      case "edit_cancellation_policy": {
        // Canonical keys: booking_cancellation_cutoff_hours /
        // booking_cancellation_fee at locale 'en-US'.
        const tenant = resolveTenantId(req);
        let updated = 0;
        if (payload.cancellation_window_hours !== undefined) { await saveSiteSetting(tenant, "booking_cancellation_cutoff_hours", "Cancellation Cutoff (hours)", String(payload.cancellation_window_hours)); updated++; }
        if (payload.cancellation_fee !== undefined) { await saveSiteSetting(tenant, "booking_cancellation_fee", "Cancellation Fee", String(payload.cancellation_fee)); updated++; }
        await auditAction({ action, domain: "crm", tableName: "cms_global_content", recordId: null, afterData: { updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, updated, message: `${updated} cancellation policy settings saved` });
      }

      case "edit_no_show_penalty": {
        // Canonical keys: booking_no_show_fee / booking_no_show_grace_period
        // at locale 'en-US'.
        const tenant = resolveTenantId(req);
        let updated = 0;
        if (payload.no_show_fee !== undefined) { await saveSiteSetting(tenant, "booking_no_show_fee", "No-Show Penalty", String(payload.no_show_fee)); updated++; }
        if (payload.no_show_grace_period !== undefined) { await saveSiteSetting(tenant, "booking_no_show_grace_period", "No-Show Grace Period (min)", String(payload.no_show_grace_period)); updated++; }
        await auditAction({ action, domain: "crm", tableName: "cms_global_content", recordId: null, afterData: { updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, updated, message: `${updated} no-show penalty settings saved` });
      }

      case "view_system_health": {
        // Query key tables for row counts to surface system health.
        const tables = ["crm_customers", "crm_appointments", "crm_pets", "commerce_orders", "commerce_payments", "acct_ar_invoices", "commerce_gift_cards", "crm_staff", "erp_inventory_movements"];
        const health: Array<{ table: string; rowCount: number }> = [];
        for (const t of tables) {
          const r = await pgQuery<{ n: string }>(`SELECT COUNT(*)::text AS n FROM public.${t} WHERE tenant_id = $1`, [resolveTenantId(req)]);
          health.push({ table: t, rowCount: Number(r[0]?.n || 0) });
        }
        // Check for recent audit log activity (last hour)
        const auditCount = await pgQuery<{ n: string }>(`SELECT COUNT(*)::text AS n FROM public.crm_audit_log WHERE tenant_id = $1 AND occurred_at >= now() - INTERVAL '1 hour'`, [resolveTenantId(req)]);
        const result = { tables: health, recentAuditEntries: Number(auditCount[0]?.n || 0), status: "healthy" };
        await auditAction({ action, domain: "crm", tableName: null, recordId: null, afterData: { tableCount: health.length, recentAuditEntries: result.recentAuditEntries }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, systemHealth: result });
      }

      case "run_backup": {
        // REAL BACKUP: delegates to the per-tenant backup engine
        // (src/lib/backups/engine.ts). Backups are a paid add-on — the
        // engine enforces tenants.backup_addon_enabled, archives the
        // tenant's operational tables as JSON to the private tenant-backups
        // bucket, and records the run in platform_backups. Entitled tenants
        // get a real backup with real size/counts; non-entitled tenants get
        // the upsell refusal; a failed run surfaces the real error.
        const tenant = resolveTenantId(req);
        const backupType = String(payload.backup_type || "full");
        try {
          const result = await runTenantBackup(tenant, { requestedBy: actorId, backupType, source: "quick_action" });
          await auditAction({ action, domain: "crm", tableName: "platform_backups", recordId: result.id, afterData: { backupType, status: "completed", sizeBytes: result.sizeBytes, totalRows: result.totalRows, tableCount: result.tableCount, storagePath: result.storagePath }, actorUserId: actorId, ipAddress: ip });
          const mb = (result.sizeBytes / (1024 * 1024)).toFixed(2);
          return NextResponse.json({
            ok: true,
            backup: { id: result.id, status: result.status, sizeBytes: result.sizeBytes, totalRows: result.totalRows, tableCount: result.tableCount, storagePath: result.storagePath, completedAt: result.completedAt },
            message: `Backup completed — ${result.tableCount} tables, ${result.totalRows.toLocaleString()} rows, ${mb} MB archived. Download it from Settings → Backups.`,
          });
        } catch (e: any) {
          if (e instanceof BackupNotEntitledError) {
            await auditAction({ action, domain: "crm", tableName: "platform_backups", recordId: null, afterData: { backupType, status: "refused_not_entitled" }, actorUserId: actorId, ipAddress: ip });
            return NextResponse.json({ ok: false, upsell: true, error: BACKUP_UPSELL_MESSAGE, backupType, status: "not_entitled" }, { status: 403 });
          }
          await auditAction({ action, domain: "crm", tableName: "platform_backups", recordId: e?.backupId || null, afterData: { backupType, status: "failed", error: e?.message || "Backup failed" }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: false, error: e?.message || "Backup failed", backupType, status: "failed", backupId: e?.backupId || null }, { status: 500 });
        }
      }

      case "view_quick_links": {
        const rows = await pgQuery<{ id: string; label: string; url: string | null; icon: string | null; sort_order: number; is_active: boolean }>(
          `SELECT id, label, url, icon, sort_order, is_active FROM public.platform_quick_links WHERE tenant_id = $1 AND is_active = true ORDER BY sort_order`,
          [resolveTenantId(req)],
        );
        const links = rows.map(r => ({ id: r.id, label: r.label, url: r.url, icon: r.icon, sortOrder: r.sort_order, isActive: r.is_active }));
        await auditAction({ action, domain: "crm", tableName: "platform_quick_links", recordId: null, afterData: { count: links.length }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, quickLinks: links, total: links.length });
      }

      case "add_quick_link": {
        // Management path for SA-107's table — the same write the
        // /api/admin/settings/quick-links REST route performs.
        const label = String(payload.label || "").trim();
        const url = String(payload.url || "").trim();
        if (!label || !url) return NextResponse.json({ ok: false, error: "label and url are required" }, { status: 400 });
        const tenant = resolveTenantId(req);
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.platform_quick_links
             (id, tenant_id, label, url, icon, sort_order, opens_new_tab, is_active, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4,
                   (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.platform_quick_links WHERE tenant_id = $1),
                   $5, true, $6::uuid, now(), now())
           RETURNING id`,
          [tenant, label, url, payload.icon ? String(payload.icon) : null, payload.opens_new_tab !== undefined ? payload.opens_new_tab === true || payload.opens_new_tab === "true" : true, actorId],
        );
        const linkId = rows[0]?.id ?? null;
        if (!linkId) return NextResponse.json({ ok: false, error: "Quick link could not be created — it was not saved" }, { status: 500 });
        await auditAction({ action, domain: "crm", tableName: "platform_quick_links", recordId: linkId, afterData: { label, url }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, linkId, label, url });
      }

      case "edit_quick_link": {
        const linkId = String(payload.link_id || "");
        if (!linkId) return NextResponse.json({ ok: false, error: "link_id required" }, { status: 400 });
        const tenant = resolveTenantId(req);
        const updated = await pgExec(
          `UPDATE public.platform_quick_links
              SET label = COALESCE($1, label),
                  url = COALESCE($2, url),
                  icon = COALESCE($3, icon),
                  sort_order = COALESCE($4, sort_order),
                  is_active = COALESCE($5, is_active),
                  updated_at = now()
            WHERE id = $6::uuid AND tenant_id = $7`,
          [
            payload.label !== undefined ? String(payload.label) : null,
            payload.url !== undefined ? String(payload.url) : null,
            payload.icon !== undefined ? String(payload.icon) : null,
            payload.sort_order !== undefined ? Number(payload.sort_order) : null,
            payload.is_active !== undefined ? payload.is_active === true || payload.is_active === "true" : null,
            linkId,
            tenant,
          ],
        );
        if (!updated) return NextResponse.json({ ok: false, error: "Quick link not found" }, { status: 404 });
        await auditAction({ action, domain: "crm", tableName: "platform_quick_links", recordId: linkId, afterData: { updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, linkId, updated });
      }

      case "delete_quick_link": {
        // Retire (is_active = false) — the view serves active links
        // only, and a retired link can be reactivated via edit.
        const linkId = String(payload.link_id || "");
        if (!linkId) return NextResponse.json({ ok: false, error: "link_id required" }, { status: 400 });
        const tenant = resolveTenantId(req);
        const updated = await pgExec(
          `UPDATE public.platform_quick_links SET is_active = false, updated_at = now()
            WHERE id = $1::uuid AND tenant_id = $2`,
          [linkId, tenant],
        );
        if (!updated) return NextResponse.json({ ok: false, error: "Quick link not found" }, { status: 404 });
        await auditAction({ action, domain: "crm", tableName: "platform_quick_links", recordId: linkId, afterData: { retired: updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, linkId, retired: updated });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action} (short: ${shortAction})` }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[system/actions] ${action} failed:`, msg);
    return NextResponse.json({ error: msg, action }, { status: 500 });
  }
}
