import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireAdminApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import {
  platformGrantsForStaff,
  syncPortalGrantsToStaff,
} from "@/lib/admin/module-grant-sync";

/* Admin → Settings → Users: franchise-model permissions.
 *
 * Tables (franchise-permissions-schema, all in public):
 *   portal_users, portal_module_permissions, portal_action_permissions,
 *   tenants (parent_tenant_id), franchise_locations, franchise_agreements,
 *   seller_category_permissions, seller_capabilities,
 *   vet_profiles, pharmacy_profiles, portal_permission_audit_log
 *
 * Role-first UI: pick role_type, then the matching editor renders.
 * Customers get no rows — uniform experience.
 */

const ROLES = [
  { value: "owner", label: "Owner", desc: "Full control — bypasses every permission check.", portal: "admin" },
  { value: "internal_employee", label: "Internal Employee", desc: "Module-level Read / Write / All on the master tenant.", portal: "admin" },
  { value: "franchise_owner", label: "Franchise Owner", desc: "Full admin on their own shop tenant (mini-owner).", portal: "admin" },
  { value: "franchise_employee", label: "Franchise Employee", desc: "Module-level permissions on their franchise tenant.", portal: "admin" },
  { value: "seller", label: "Seller", desc: "Category permissions + Pro gating on the marketplace.", portal: "seller" },
  { value: "vet", label: "Veterinarian", desc: "Action-level telemedicine permissions.", portal: "vet" },
  { value: "pharmacy", label: "Pharmacy", desc: "HIPAA-strict prescription permissions. Every sensitive action is audited.", portal: "pharmacy" },
  { value: "groomer_partner", label: "Groomer Partner", desc: "Lead management only (leads outside Memphis).", portal: "admin" },
] as const;

type RoleType = (typeof ROLES)[number]["value"];

// Module tree. `scopes` controls which roles see the module in the editor.
const MODULES: { code: string; label: string; group: string; scopes: string[] }[] = [
  { code: "crm", label: "CRM Dashboard", group: "CRM", scopes: ["internal", "franchise"] },
  { code: "customers", label: "Customers", group: "CRM", scopes: ["internal", "franchise"] },
  { code: "leads", label: "Leads", group: "CRM", scopes: ["internal", "franchise", "groomer"] },
  { code: "appointments", label: "Appointments", group: "CRM", scopes: ["internal", "franchise", "groomer"] },
  { code: "communications", label: "Communications", group: "CRM", scopes: ["internal", "franchise"] },
  { code: "accounting", label: "Accounting", group: "ACCOUNTING", scopes: ["internal", "franchise"] },
  { code: "payments", label: "Payments & Register", group: "ACCOUNTING", scopes: ["internal", "franchise"] },
  { code: "invoices", label: "Invoices", group: "ACCOUNTING", scopes: ["internal", "franchise"] },
  { code: "deposits", label: "Deposits & Escrow", group: "ACCOUNTING", scopes: ["internal", "franchise"] },
  { code: "refunds_disputes", label: "Refunds & Disputes", group: "ACCOUNTING", scopes: ["internal", "franchise"] },
  { code: "gift_cards_credits", label: "Gift Cards & Credits", group: "ACCOUNTING", scopes: ["internal", "franchise"] },
  { code: "orders", label: "Orders & Fulfillment", group: "ORDERS", scopes: ["internal", "franchise"] },
  { code: "inventory", label: "Inventory", group: "ORDERS", scopes: ["internal", "franchise"] },
  { code: "products_services", label: "Products & Services", group: "ORDERS", scopes: ["internal", "franchise"] },
  { code: "purchasing", label: "Purchasing", group: "ORDERS", scopes: ["internal", "franchise"] },
  { code: "shipping", label: "Shipping & Labels", group: "ORDERS", scopes: ["internal", "franchise"] },
  { code: "sellers", label: "Sellers & Marketplace", group: "MARKETPLACE", scopes: ["internal"] },
  { code: "trust_safety", label: "Trust Center", group: "MARKETPLACE", scopes: ["internal"] },
  { code: "marketing", label: "Marketing", group: "MARKETING", scopes: ["internal", "franchise"] },
  { code: "analytics", label: "Analytics", group: "REPORTS", scopes: ["internal", "franchise"] },
  { code: "reports", label: "Reports", group: "REPORTS", scopes: ["internal", "franchise"] },
  { code: "staff_groomer_management", label: "Staff Management", group: "SYSTEM", scopes: ["internal", "franchise"] },
  { code: "administration", label: "Administration", group: "SYSTEM", scopes: ["internal"] },
  { code: "policies", label: "Policies", group: "SYSTEM", scopes: ["internal"] },
  { code: "docs", label: "Document Center", group: "SYSTEM", scopes: ["internal"] },
  { code: "telemedicine", label: "Telemedicine", group: "VET", scopes: ["internal"] },
  { code: "prescriptions", label: "Prescriptions", group: "VET", scopes: ["internal"] },
  { code: "pharmacy_queue", label: "Pharmacy Queue", group: "PHARMACY", scopes: ["internal"] },
];

const VALID_LEVELS = new Set(["none", "read", "write", "all"]);

// Action toggles per role.
const ACTIONS: Record<string, { key: string; label: string; desc: string }[]> = {
  vet: [
    { key: "vet.review_lead", label: "Review leads", desc: "View and triage incoming vet leads." },
    { key: "vet.write_case_notes", label: "Write case notes", desc: "Add clinical notes to a case." },
    { key: "vet.view_patient_history", label: "View patient history", desc: "Read prior visits and records." },
    { key: "vet.start_session", label: "Start telemedicine session", desc: "Open a live video session with the pet parent." },
    { key: "vet.issue_prescription", label: "Issue prescription", desc: "Write a new prescription." },
    { key: "vet.forward_prescription", label: "Forward prescription", desc: "Send a prescription to a pharmacy." },
  ],
  pharmacy: [
    { key: "pharmacy.view_prescription", label: "View prescriptions", desc: "Read incoming prescriptions. Logged for HIPAA." },
    { key: "pharmacy.dispense", label: "Dispense", desc: "Mark a prescription as dispensed. Logged for HIPAA." },
    { key: "pharmacy.refill", label: "Refills", desc: "Process refill requests. Logged for HIPAA." },
    { key: "pharmacy.forward_prescription", label: "Forward prescription", desc: "Transfer to another pharmacy. Logged for HIPAA." },
    { key: "pharmacy.view_patient_history", label: "View patient history", desc: "Minimum-necessary access. Logged for HIPAA." },
    { key: "pharmacy.contact_prescriber", label: "Contact prescriber", desc: "Message the prescribing vet." },
  ],
  seller: [
    { key: "seller.go_pro", label: "Eligible for Pro", desc: "Can upgrade to Pro seller tier." },
    { key: "seller.advertise", label: "Advertising", desc: "Can run marketplace ads." },
    { key: "seller.bulk_import", label: "Bulk import", desc: "Can bulk-import catalog via spreadsheet." },
  ],
  groomer_partner: [
    { key: "leads.assign", label: "Claim leads", desc: "Assign incoming leads to themselves." },
    { key: "leads.forward", label: "Forward leads", desc: "Forward a lead to another partner." },
  ],
  internal_employee: [
    { key: "docs.publish", label: "Publish docs", desc: "Publish, retire, and restore Document Center articles." },
    { key: "docs.manage", label: "Manage docs", desc: "Reorder articles, edit section metadata, delete draft articles." },
  ],
};

const SELLER_CATEGORIES = [
  { key: "pet_supplies", label: "Pet Supplies" },
  { key: "grooming", label: "Grooming" },
  { key: "pharmacy", label: "Pharmacy (OTC)" },
  { key: "live_goods", label: "Live Goods" },
];

function roleScope(role: string): string {
  if (role === "franchise_owner" || role === "franchise_employee") return "franchise";
  if (role === "groomer_partner") return "groomer";
  return "internal";
}

async function tableExists(client: any, table: string, schema = "public"): Promise<boolean> {
  try {
    const r = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema=$2 AND table_name=$1 LIMIT 1`,
      [table, schema],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  try {
    const { searchParams } = new URL(req.url);
    const portalUserId = searchParams.get("portalUserId");

    const data = await withPg(async (client) => {
      const hasPortalUsers = await tableExists(client, "portal_users");
      if (!hasPortalUsers) {
        return { missing: true };
      }

      // Roster
      let roster: any[] = [];
      if (searchParams.get("list") === "1") {
        const r = await client.query(
          `SELECT pu.id::text AS id, pu.user_id::text AS user_id, pu.role_type, pu.portal,
                  pu.display_name, pu.email, pu.is_owner, pu.is_active,
                  pu.tenant_id::text AS tenant_id, t.name AS tenant_name, t.tenant_type,
                  tm.last_active_at::text AS last_active_at,
                  COALESCE(tm.mfa_enabled, false) AS mfa_enabled,
                  (SELECT count(*)::int FROM public.portal_module_permissions p
                    WHERE p.portal_user_id = pu.id AND p.permission_level <> 'none') AS grant_count
             FROM public.portal_users pu
             LEFT JOIN public.tenants t ON t.id = pu.tenant_id
             LEFT JOIN public.tenant_memberships tm
               ON tm.user_id = pu.user_id AND tm.tenant_id = pu.tenant_id
            ORDER BY pu.is_owner DESC, pu.role_type, pu.display_name NULLS LAST
            LIMIT 200`,
        );
        roster = r.rows;
      }

      // Detail
      let detail: any = null;
      if (portalUserId) {
        const u = await client.query(
          `SELECT pu.id::text AS id, pu.tenant_id::text AS tenant_id, pu.user_id::text AS user_id,
                  pu.role_type, pu.portal, pu.parent_id::text AS parent_id,
                  pu.display_name, pu.email, pu.phone, pu.is_owner, pu.is_active,
                  t.name AS tenant_name
             FROM public.portal_users pu
             LEFT JOIN public.tenants t ON t.id = pu.tenant_id
            WHERE pu.id = $1::uuid LIMIT 1`,
          [portalUserId],
        );
        if (u.rows[0]) {
          const pu = u.rows[0];
          const mods = await client.query(
            `SELECT module_key, permission_level FROM public.portal_module_permissions WHERE portal_user_id = $1::uuid`,
            [portalUserId],
          );
          const acts = await client.query(
            `SELECT action_key, is_allowed FROM public.portal_action_permissions WHERE portal_user_id = $1::uuid`,
            [portalUserId],
          );
          detail = {
            ...pu,
            modulePermissions: Object.fromEntries(mods.rows.map((m: any) => [m.module_key, m.permission_level])),
            actionPermissions: Object.fromEntries(acts.rows.map((a: any) => [a.action_key, a.is_allowed])),
          };

          // The employee-shell truth for this person: their portal
          // grants (M3: portal_module_permissions IS the store the
          // employee gate enforces — no mirror needed anymore), in
          // portal vocabulary — shown to the admin as-is.
          const staffView = await platformGrantsForStaff(client, pu.tenant_id, pu.user_id);
          detail.staffLinked = !!staffView;
          detail.staffId = staffView?.staffId ?? null;
          detail.employeeModules = staffView?.grants ?? {};

          // Seller extras: link portal user -> sellers row by email, then categories + capabilities
          if (pu.role_type === "seller") {
            const s = await client.query(
              `SELECT id::text AS id, display_name, email FROM public.sellers WHERE lower(email) = lower($1) LIMIT 1`,
              [pu.email || ""],
            );
            if (s.rows[0]) {
              detail.sellerId = s.rows[0].id;
              detail.sellerName = s.rows[0].display_name;
              const cats = await client.query(
                `SELECT category_key, is_allowed, requires_pro FROM public.seller_category_permissions WHERE seller_id = $1::uuid`,
                [s.rows[0].id],
              );
              detail.sellerCategories = Object.fromEntries(
                cats.rows.map((c: any) => [c.category_key, { is_allowed: c.is_allowed, requires_pro: c.requires_pro }]),
              );
              const cap = await client.query(
                `SELECT is_pro, can_advertise, can_bulk_import, status FROM public.seller_capabilities WHERE seller_id = $1::uuid LIMIT 1`,
                [s.rows[0].id],
              );
              detail.capabilities = cap.rows[0] || null;
            }
          }

          if (pu.role_type === "vet" && (await tableExists(client, "vet_profiles", "clinical"))) {
            const v = await client.query(
              `SELECT license_number, license_state, specialty, clinic_name, status FROM clinical.vet_profiles WHERE portal_user_id = $1::uuid LIMIT 1`,
              [portalUserId],
            );
            detail.vetProfile = v.rows[0] || null;
          }
          if (pu.role_type === "pharmacy" && (await tableExists(client, "pharmacy_profiles", "clinical"))) {
            const p = await client.query(
              `SELECT license_number, license_state, pharmacy_name, status FROM clinical.pharmacy_profiles WHERE portal_user_id = $1::uuid LIMIT 1`,
              [portalUserId],
            );
            detail.pharmacyProfile = p.rows[0] || null;
          }
        }
      }

      // Pickers
      const tenantsR = await client.query(
        `SELECT id::text AS id, name, slug, tenant_type, status FROM public.tenants ORDER BY tenant_type, name LIMIT 100`,
      );
      const sellersR = await client.query(
        `SELECT id::text AS id, display_name, email FROM public.sellers WHERE tenant_id = $1 ORDER BY display_name LIMIT 100`,
        [resolveTenantId(req)],
      );
      const authR = await client.query(
        `SELECT id::text AS id, email FROM auth.users ORDER BY created_at DESC LIMIT 200`,
      );

      return {
        roster,
        detail,
        tenants: tenantsR.rows,
        sellers: sellersR.rows,
        authUsers: authR.rows,
        roles: ROLES,
        modules: MODULES,
        actions: ACTIONS,
        sellerCategories: SELLER_CATEGORIES,
        masterTenantId: resolveTenantId(req),
      };
    });

    if (!data) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[GET /api/admin/users/permissions]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  try {
    const body = await req.json();
    const {
      portalUserId, userId, displayName, email, phone,
      roleType, tenantId, parentId, isOwner, isActive,
      modulePermissions, actionPermissions,
      sellerId, sellerCategories, capabilities,
      vetProfile, pharmacyProfile,
      franchise,
    } = body as Record<string, any>;

    if (!roleType) return NextResponse.json({ error: "roleType is required" }, { status: 400 });
    const role = ROLES.find((r) => r.value === roleType);
    if (!role) return NextResponse.json({ error: `Unknown roleType: ${roleType}` }, { status: 400 });

    const saved = await withPg(async (client) => {
      const hasPortalUsers = await tableExists(client, "portal_users");
      if (!hasPortalUsers) return { error: "portal_users table missing — run the franchise permissions schema first." };

      let tenant = tenantId || resolveTenantId(req);
      let franchiseLocationId: string | null = null;

      // Franchise owner: optionally spin up a brand-new franchise tenant.
      if (roleType === "franchise_owner" && franchise?.createNew) {
        const bizName = (franchise.businessName || "").trim();
        const slug = (franchise.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        if (!bizName || !slug) return { error: "Business name and slug are required for a new franchise." };
        const master = await client.query(`SELECT id FROM public.tenants WHERE slug='all-about-portal' LIMIT 1`);
        const masterId = master.rows[0]?.id || resolveTenantId(req);
        const t = await client.query(
          `INSERT INTO public.tenants (parent_tenant_id, tenant_type, name, slug, status)
           VALUES ($1::uuid, 'franchise', $2, $3, 'active')
           ON CONFLICT DO NOTHING RETURNING id::text AS id`,
          [masterId, bizName, slug],
        );
        let newTenantId = t.rows[0]?.id;
        if (!newTenantId) {
          const ex = await client.query(`SELECT id::text AS id FROM public.tenants WHERE slug=$1 LIMIT 1`, [slug]);
          newTenantId = ex.rows[0]?.id;
        }
        if (!newTenantId) return { error: "Could not create franchise tenant." };
        tenant = newTenantId;
        const fl = await client.query(
          `INSERT INTO public.franchise_locations (tenant_id, parent_tenant_id, business_name, slug, status)
           VALUES ($1::uuid, $2::uuid, $3, $4, 'active') RETURNING id::text AS id`,
          [tenant, masterId, bizName, slug],
        );
        franchiseLocationId = fl.rows[0]?.id || null;
      }

      // Find-or-create the portal_user row.
      let puId: string | null = portalUserId || null;
      if (puId) {
        await client.query(
          `UPDATE public.portal_users
              SET role_type=$2, portal=$3, tenant_id=$4::uuid, parent_id=$5::uuid,
                  display_name=$6, email=$7, phone=$8,
                  is_owner=$9, is_active=COALESCE($10, true), updated_at=now()
            WHERE id=$1::uuid`,
          [puId, roleType, role.portal, tenant, parentId || null, displayName || null, email || null, phone || null, !!isOwner, isActive],
        );
      } else {
        if (!userId) return { error: "userId (auth user) is required to create a portal user." };
        const ex = await client.query(
          `SELECT id::text AS id FROM public.portal_users
            WHERE tenant_id=$1::uuid AND user_id=$2::uuid AND role_type=$3 AND portal=$4 LIMIT 1`,
          [tenant, userId, roleType, role.portal],
        );
        if (ex.rows[0]) {
          puId = ex.rows[0].id;
          await client.query(
            `UPDATE public.portal_users SET display_name=$2, email=$3, phone=$4, is_owner=$5,
                    is_active=COALESCE($6,true), parent_id=$7::uuid, updated_at=now() WHERE id=$1::uuid`,
            [puId, displayName || null, email || null, phone || null, !!isOwner, isActive, parentId || null],
          );
        } else {
          const ins = await client.query(
            `INSERT INTO public.portal_users
               (tenant_id, user_id, role_type, portal, parent_id, display_name, email, phone, is_owner, is_active)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7, $8, $9, COALESCE($10, true))
             RETURNING id::text AS id`,
            [tenant, userId, roleType, role.portal, parentId || null, displayName || null, email || null, phone || null, !!isOwner, isActive],
          );
          puId = ins.rows[0]?.id || null;
        }
      }
      if (!puId) return { error: "Could not save portal user." };

      if (franchiseLocationId) {
        await client.query(
          `UPDATE public.franchise_locations SET owner_portal_user_id=$2::uuid WHERE id=$1::uuid`,
          [franchiseLocationId, puId],
        );
      }

      const audit = async (changeType: string, key: string, oldV: any, newV: any) => {
        try {
          await client.query(
            `INSERT INTO public.portal_permission_audit_log
               (tenant_id, portal_user_id, change_type, key, old_value, new_value)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
            [tenant, puId, changeType, key, oldV == null ? null : String(oldV), newV == null ? null : String(newV)],
          );
        } catch { /* audit table optional */ }
      };

      // Module permissions: replace the set.
      let staffGrantSync: Awaited<ReturnType<typeof syncPortalGrantsToStaff>> | null = null;
      if (modulePermissions && typeof modulePermissions === "object") {
        const scope = roleScope(roleType);
        await client.query(`DELETE FROM public.portal_module_permissions WHERE portal_user_id=$1::uuid`, [puId]);
        for (const [code, raw] of Object.entries(modulePermissions)) {
          const mod = MODULES.find((m) => m.code === code);
          if (!mod || !mod.scopes.includes(scope)) continue;
          const level = String(raw || "none");
          if (!VALID_LEVELS.has(level) || level === "none") continue;
          await client.query(
            `INSERT INTO public.portal_module_permissions (tenant_id, portal_user_id, module_key, permission_level)
             VALUES ($1::uuid, $2::uuid, $3, $4)`,
            [tenant, puId, code, level],
          );
        }
        await audit("module", "bulk", null, `${Object.keys(modulePermissions).length} modules set`);

        // M3: no mirror — the portal rows saved above ARE the store
        // the employee module gate (and requireModuleApi) enforce.
        // syncPortalGrantsToStaff is now a read-back report (what the
        // employee shell will enforce for this person); franchise
        // guardrails apply inside the report.
        const puRow = await client.query(
          `SELECT user_id::text AS user_id FROM public.portal_users WHERE id=$1::uuid LIMIT 1`,
          [puId],
        );
        const tt = await client.query(
          `SELECT tenant_type FROM public.tenants WHERE id=$1::uuid LIMIT 1`,
          [tenant],
        );
        staffGrantSync = await syncPortalGrantsToStaff(client, {
          tenantId: tenant,
          tenantType: tt.rows[0]?.tenant_type ?? null,
          userId: puRow.rows[0]?.user_id ?? userId ?? null,
          modulePermissions: modulePermissions as Record<string, string>,
          scopedCodes: MODULES.filter((m) => m.scopes.includes(scope)).map((m) => m.code),
        });
        if (staffGrantSync.staffLinked) {
          await audit(
            "module_staff_sync",
            staffGrantSync.staffId || "",
            null,
            `${staffGrantSync.granted} granted, ${staffGrantSync.revoked} revoked` +
              (staffGrantSync.guardrailSkipped.length
                ? `, guardrail skipped: ${staffGrantSync.guardrailSkipped.join(",")}`
                : ""),
          );
        }
      }

      // Action permissions: replace the set.
      if (actionPermissions && typeof actionPermissions === "object") {
        await client.query(`DELETE FROM public.portal_action_permissions WHERE portal_user_id=$1::uuid`, [puId]);
        for (const [key, allowed] of Object.entries(actionPermissions)) {
          await client.query(
            `INSERT INTO public.portal_action_permissions (tenant_id, portal_user_id, action_key, is_allowed)
             VALUES ($1::uuid, $2::uuid, $3, $4)`,
            [tenant, puId, key, !!allowed],
          );
        }
        await audit("action", "bulk", null, `${Object.keys(actionPermissions).length} actions set`);
      }

      // Seller: categories + capabilities on the linked sellers row.
      if (roleType === "seller" && sellerId) {
        if (sellerCategories && typeof sellerCategories === "object") {
          for (const [catKey, v] of Object.entries(sellerCategories)) {
            const val = v as any;
            await client.query(
              `INSERT INTO public.seller_category_permissions (tenant_id, seller_id, category_key, is_allowed, requires_pro)
               VALUES ($1::uuid, $2::uuid, $3, $4, $5)
               ON CONFLICT (tenant_id, seller_id, category_key)
               DO UPDATE SET is_allowed=EXCLUDED.is_allowed, requires_pro=EXCLUDED.requires_pro, updated_at=now()`,
              [tenant, sellerId, catKey, !!val.is_allowed, !!val.requires_pro],
            );
          }
          await audit("seller_category", sellerId, null, "categories updated");
        }
        if (capabilities && typeof capabilities === "object") {
          await client.query(
            `INSERT INTO public.seller_capabilities (tenant_id, seller_id, is_pro, can_advertise, can_bulk_import, status)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
             ON CONFLICT (tenant_id, seller_id)
             DO UPDATE SET is_pro=EXCLUDED.is_pro, can_advertise=EXCLUDED.can_advertise,
                           can_bulk_import=EXCLUDED.can_bulk_import, status=EXCLUDED.status, updated_at=now()`,
            [tenant, sellerId, !!capabilities.is_pro, !!capabilities.can_advertise, !!capabilities.can_bulk_import, capabilities.status || "active"],
          );
          await audit("pro_status", sellerId, null, capabilities.is_pro ? "pro" : "standard");
        }
      }

      // Vet / pharmacy profiles.
      if (roleType === "vet" && vetProfile) {
        await client.query(
          `INSERT INTO clinical.vet_profiles (tenant_id, portal_user_id, license_number, license_state, specialty, clinic_name, status)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
           ON CONFLICT (tenant_id, portal_user_id)
           DO UPDATE SET license_number=EXCLUDED.license_number, license_state=EXCLUDED.license_state,
                         specialty=EXCLUDED.specialty, clinic_name=EXCLUDED.clinic_name, status=EXCLUDED.status, updated_at=now()`,
          [tenant, puId, vetProfile.license_number || null, vetProfile.license_state || null, vetProfile.specialty || null, vetProfile.clinic_name || null, vetProfile.status || "active"],
        );
      }
      if (roleType === "pharmacy" && pharmacyProfile) {
        await client.query(
          `INSERT INTO clinical.pharmacy_profiles (tenant_id, portal_user_id, license_number, license_state, pharmacy_name, status)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
           ON CONFLICT (tenant_id, portal_user_id)
           DO UPDATE SET license_number=EXCLUDED.license_number, license_state=EXCLUDED.license_state,
                         pharmacy_name=EXCLUDED.pharmacy_name, status=EXCLUDED.status, updated_at=now()`,
          [tenant, puId, pharmacyProfile.license_number || null, pharmacyProfile.license_state || null, pharmacyProfile.pharmacy_name || null, pharmacyProfile.status || "active"],
        );
      }

      await audit("role", roleType, null, `${roleType}@${role.portal}`);
      return { portalUserId: puId, tenantId: tenant, franchiseLocationId, staffGrantSync };
    });

    if (!saved) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    if ((saved as any).error) return NextResponse.json({ error: (saved as any).error }, { status: 400 });
    return NextResponse.json({ success: true, ...(saved as object) });
  } catch (err: any) {
    console.error("[PUT /api/admin/users/permissions]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
