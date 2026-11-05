// ===========================================================================
// _provision.ts — G14 activation provisioning for the onboarding engine.
//
// THE systemic defect this module exists to NOT repeat (verified by three
// recon workers, 2026-10-17): both existing provisioners
// (api/admin/franchise/signup, lib/partners/groomer-activation.ts) insert
// portal_users rows WITHOUT user_id and never create/invite an auth
// account — while resolvePortalUser step 1b matches portal_users STRICTLY
// by user_id, and portal_users.user_id is NOT NULL live. Approved partners
// provisioned that way can never sign in.
//
// Mandatory order here:
//   1. Ensure the auth user exists — find by email (portal-auth
//      findAuthUserByEmail, the sellers/provisioning precedent) or
//      inviteUserByEmail (the admin/users precedent).
//   2. Write portal_users WITH user_id + role_type + is_active.
//   3. Write the party's own-data record WITH its user linkage:
//      vet → clinical.vet_profiles (portal_user_id) AND the
//      clinical.veterinarians roster row WITH user_id (the cabinet /
//      provider profile read the roster by user_id — resolveTelemedVet)
//      + per-state clinical.veterinarian_licenses rows;
//      pharmacy → clinical.pharmacy_profiles (portal_user_id);
//      groomer → crm_staff WITH user_id (employee portal resolves via
//      crm_staff.user_id) + groomer module/action grants;
//      franchise → the signup route's full write set (child tenant,
//      franchise_locations, franchise_agreements, tenant_locations,
//      module grants, crm_staff owner) WITH user_id added on both
//      portal_users and crm_staff — duplication of the signup write set
//      is noted in admin-review.md for later refactor (the signup route
//      is monolithic and exports no helpers);
//      seller types → the existing seller provisioning (sellers row by
//      email → provisionSellerGrants + portal_users parent link, exactly
//      lib/sellers/provisioning's shape); the engine case is marked
//      ACTIVE by the caller — seller onboarding is NOT rebuilt here.
//   4. Issue the identity_grants row for the portal just provisioned
//      (grantShapeFor / issueIdentityGrant below) — the grants-first
//      resolver never re-reads portal_users once any grant exists, so
//      without this step a second portal never adjoins the identity
//      (Journey L21). Suspend / offboard flips the grant together with
//      the row (setPortalAssignmentActive), or the grant would outlive
//      the deactivation it mirrors.
// ===========================================================================

import { pgQuery, pgQueryStrict } from "@/lib/pg";
import { withPg, TENANT_ID } from "@/lib/crm/enterprise";
import { getSupabaseAdmin, findAuthUserByEmail } from "@/lib/portal-auth";
import { provisionSellerGrants } from "@/lib/sellers/provisioning";
import { sendEmail } from "@/lib/email";
import { esc, simpleEmail } from "@/lib/email/design";
import { toResendVariables } from "@/lib/email/resend-templates";
import type { OnboardingGate } from "@/lib/onboarding";
import type { DisplayCase, DisplayCapability } from "./_shared";

type AnyRow = Record<string, any>;
type PgClientLike = { query: (text: string, params?: unknown[]) => Promise<any> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Franchise-owner module set — mirrors api/admin/franchise/signup exactly
// (the modules whose scopes include "franchise"; master-only modules are
// never granted).
const FRANCHISE_OWNER_MODULES = [
  "crm", "customers", "leads", "appointments", "communications",
  "accounting", "payments", "invoices", "deposits", "refunds_disputes",
  "gift_cards_credits", "orders", "inventory", "products_services",
  "purchasing", "shipping", "marketing", "analytics", "reports",
  "staff_groomer_management",
];

// Groomer-partner grants per Admin → Settings → Users definitions
// (api/admin/users/permissions): modules scoped "groomer" are leads +
// appointments; actions are leads.assign / leads.forward.
const GROOMER_MODULES = ["leads", "appointments"];
const GROOMER_ACTIONS = ["leads.assign", "leads.forward"];

export const ROLE_FOR_TYPE: Record<string, { role_type: string; portal: string; is_owner: boolean }> = {
  // is_owner in the house vocabulary means TENANT owner: resolvePortalUser
  // checks it before the role branches, and an is_owner row resolves as
  // the tenant's admin ("owner" membership), never as its role_type. A
  // marketplace seller owns their STORE (that ownership lives in the
  // sellers/seller_users rows), not the tenant — seller rows therefore
  // carry is_owner=false, so approval resolves membershipRole "seller"
  // and the account drawer offers the seller portal. (Franchise keeps
  // is_owner=true: a franchise owner DOES administer their child tenant,
  // and lands on the admin console under either branch.)
  individual_seller: { role_type: "seller", portal: "seller", is_owner: false },
  business_seller: { role_type: "seller", portal: "seller", is_owner: false },
  manufacturer: { role_type: "seller", portal: "seller", is_owner: false },
  groomer: { role_type: "groomer_partner", portal: "admin", is_owner: false },
  pharmacy: { role_type: "pharmacy", portal: "pharmacy", is_owner: false },
  veterinarian: { role_type: "vet", portal: "vet", is_owner: false },
  franchise: { role_type: "franchise_owner", portal: "admin", is_owner: true },
};

async function tableExists(client: PgClientLike, table: string, schema = "public"): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=$2 AND table_name=$1 LIMIT 1`,
    [table, schema],
  );
  return (r.rowCount ?? r.rows?.length ?? 0) > 0;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function splitName(name: string | null, fallback: string): { first: string; last: string | null } {
  const parts = (name || fallback).split(/\s+/).filter(Boolean);
  return { first: parts[0] || fallback, last: parts.slice(1).join(" ") || null };
}

// ---------------------------------------------------------------------------
// Step 1 — auth user first (user_id is NOT NULL on portal_users)
// ---------------------------------------------------------------------------

export async function ensureAuthUser(
  email: string,
  displayName: string | null,
): Promise<{ userId: string; invited: boolean; existed: boolean }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin client not configured — cannot ensure an auth user");
  const existing = await findAuthUserByEmail(admin, email);
  if (existing?.id) return { userId: String(existing.id), invited: false, existed: true };
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: displayName || email.split("@")[0] },
  });
  if (error) {
    // Race: the user may have been created between lookup and invite.
    const retry = await findAuthUserByEmail(admin, email);
    if (retry?.id) return { userId: String(retry.id), invited: false, existed: true };
    throw new Error(`Auth invite failed: ${error.message}`);
  }
  if (!data?.user?.id) throw new Error("Auth invite returned no user");
  return { userId: String(data.user.id), invited: true, existed: false };
}

// ---------------------------------------------------------------------------
// Step 2 — portal_users WITH user_id (find-or-update, idempotent).
// Exported: the telemed credentialing desk's activation runs these
// same steps for its §1.2.1/§1.3 last mile (2026-10-23) — one
// provisioning discipline, two doors.
// ---------------------------------------------------------------------------

export async function upsertPortalUser(
  client: PgClientLike,
  opts: {
    tenantId: string; userId: string; roleType: string; portal: string;
    parentId?: string | null; displayName: string | null; email: string;
    phone: string | null; isOwner: boolean; actor: string;
  },
): Promise<string> {
  const ex = await client.query(
    `SELECT id::text AS id FROM public.portal_users
      WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role_type = $3 AND portal = $4 LIMIT 1`,
    [opts.tenantId, opts.userId, opts.roleType, opts.portal],
  );
  if (ex.rows[0]?.id) {
    await client.query(
      `UPDATE public.portal_users
          SET is_active = true, display_name = COALESCE($2, display_name),
              email = $3, phone = COALESCE($4, phone), parent_id = COALESCE($5::uuid, parent_id),
              updated_at = now()
        WHERE id = $1::uuid`,
      [ex.rows[0].id, opts.displayName, opts.email, opts.phone, opts.parentId || null],
    );
    return ex.rows[0].id;
  }
  // id := the auth user id, deliberately. Live FK truth (verified
  // 2026-10-17): clinical.vet_profiles / pharmacy_profiles .portal_user_id
  // REFERENCES auth.users(id), while every reader (api/vet/modules,
  // telemed/server resolveTelemedContext) looks profiles up by
  // portal_users.id. Setting the portal row's id equal to the auth user
  // id is the only value that satisfies BOTH the FK and the readers.
  const ins = await client.query(
    `INSERT INTO public.portal_users
       (id, tenant_id, user_id, role_type, portal, parent_id, display_name, email, phone, is_owner, is_active, invited_by, invited_at)
     VALUES ($2::uuid, $1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7, $8, $9, true, $10, now())
     RETURNING id::text AS id`,
    [
      opts.tenantId, opts.userId, opts.roleType, opts.portal, opts.parentId || null,
      opts.displayName, opts.email, opts.phone, opts.isOwner,
      UUID_RE.test(opts.actor) ? opts.actor : null,
    ],
  );
  return ins.rows[0].id;
}

// ---------------------------------------------------------------------------
// Step 2b — the identity grant (Journey L21; Cross-cutting X1 issuance).
// resolvePortalUser is GRANTS-FIRST: once a person holds any
// identity_grants row it never re-reads portal_users, and its
// self-populating fallback only ever writes the ONE legacy winner.
// So a portal_users row written at activation is invisible to anyone
// who already holds a grant — the second door (a customer who becomes
// a seller, a seller who adds a vet practice) dead-ended at sign-in.
// Activation therefore issues the grant for the portal it just
// provisioned, ADJOINING it to whatever grants the identity already
// holds. The shape mirrors resolvePortalUserLegacy's portal_users
// branch value-for-value, so the grant resolves exactly as the row
// would have. source='portal_users': the grant is backed by that row
// (the rank the resolver already assigns portal-backed grants).
// ---------------------------------------------------------------------------

function grantShapeFor(
  roleType: string,
  isOwner: boolean,
): { scope: string; role: string; membershipRole: string } | null {
  if (isOwner || roleType === "owner") {
    return { scope: "admin", role: "admin", membershipRole: "owner" };
  }
  switch (roleType) {
    case "seller":
      return { scope: "seller", role: "seller", membershipRole: "seller" };
    case "franchise_owner":
    case "internal_employee":
      return { scope: "admin", role: "admin", membershipRole: roleType };
    case "groomer_partner":
    case "franchise_employee":
      return { scope: "employee", role: "admin", membershipRole: roleType };
    default:
      return null;
  }
}

export async function issueIdentityGrant(
  client: PgClientLike,
  opts: {
    userId: string; tenantId: string; displayName: string | null;
    scope: string; role: string; membershipRole: string;
  },
): Promise<string | null> {
  const ins = await client.query(
    `INSERT INTO public.identity_grants
       (id, user_id, scope, role, membership_role, tenant_id, display_name, status, source)
     SELECT gen_random_uuid(), $1::uuid, $2, $3, $4, $5::uuid, $6, 'active', 'portal_users'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.identity_grants
         WHERE user_id = $1::uuid AND scope = $2
           AND tenant_id IS NOT DISTINCT FROM $5::uuid AND status = 'active'
      )
     RETURNING id::text AS id`,
    [opts.userId, opts.scope, opts.role, opts.membershipRole, opts.tenantId, opts.displayName],
  );
  if (ins.rows[0]?.id) return ins.rows[0].id;
  // Already held (re-activation, or the resolver's fallback beat us to
  // it) — the grant exists; report it as issued, never duplicate it.
  const ex = await client.query(
    `SELECT id::text AS id FROM public.identity_grants
      WHERE user_id = $1::uuid AND scope = $2
        AND tenant_id IS NOT DISTINCT FROM $3::uuid AND status = 'active'
      LIMIT 1`,
    [opts.userId, opts.scope, opts.tenantId],
  );
  return ex.rows[0]?.id || null;
}

// ---------------------------------------------------------------------------
// Decision emails — best-effort, house pattern (admin sellers route +
// partner-application-followup): the audited decision stands even if mail
// fails. Grooming/vet/franchise decisions email the applicant NOTHING
// today; the engine console emails BOTH directions for every type.
// ---------------------------------------------------------------------------

export async function sendDecisionEmail(opts: {
  kind: "needs_info" | "rejected" | "approved" | "activated" | "restricted" | "suspended" | "offboarded";
  to: string | null;
  name: string | null;
  typeLabel: string;
  reason?: string | null;
  message?: string | null;
}): Promise<boolean> {
  if (!opts.to) return false;
  const name = opts.name || "there";
  const copy: Record<string, { subject: string; heading: string; paragraphs: string[] }> = {
    needs_info: {
      subject: "We need a little more information — UnSaid Memories",
      heading: "A quick update on your application",
      paragraphs: [
        `Hi ${esc(name)} — your ${esc(opts.typeLabel)} application is in review, and we need a bit more information before we can finish.`,
        opts.message ? esc(opts.message) : "Please reply to this email with the missing information and we'll pick your review right back up.",
      ],
    },
    rejected: {
      subject: "Your UnSaid Memories application",
      heading: "An update on your application",
      paragraphs: [
        `Hi ${esc(name)} — thank you for applying as a ${esc(opts.typeLabel)} partner. After review, we're unable to approve your application at this time.`,
        ...(opts.reason ? [`<strong>Reason:</strong> ${esc(opts.reason)}`] : []),
        "If your circumstances change, you're welcome to apply again. Questions? Just reply to this email.",
      ],
    },
    approved: {
      subject: "Your UnSaid Memories application is approved",
      heading: "You're approved!",
      paragraphs: [
        `Hi ${esc(name)} — good news: your ${esc(opts.typeLabel)} application has been approved. We're setting up your account now — you'll get a sign-in invitation at this email address.`,
      ],
    },
    activated: {
      subject: "Your UnSaid Memories account is active",
      heading: "Your account is live",
      paragraphs: [
        `Hi ${esc(name)} — your ${esc(opts.typeLabel)} account is now active. Sign in with this email address to reach your portal.`,
        "If you were invited by email, use that link first to set your password.",
      ],
    },
    restricted: {
      subject: "Your UnSaid Memories account has been restricted",
      heading: "Account restricted",
      paragraphs: [
        `Hi ${esc(name)} — your ${esc(opts.typeLabel)} account has been restricted${opts.reason ? `: ${esc(opts.reason)}` : ""}. Reply to this email and we'll work through what is needed to restore full access.`,
      ],
    },
    suspended: {
      subject: "Your UnSaid Memories account has been suspended",
      heading: "Account suspended",
      paragraphs: [
        `Hi ${esc(name)} — your ${esc(opts.typeLabel)} account has been suspended${opts.reason ? `: ${esc(opts.reason)}` : ""}. Please contact us to resolve this.`,
      ],
    },
    offboarded: {
      subject: "Your UnSaid Memories partner account has been closed",
      heading: "Account closed",
      paragraphs: [
        `Hi ${esc(name)} — your ${esc(opts.typeLabel)} partner account has been closed${opts.reason ? `: ${esc(opts.reason)}` : ""}. Thank you for your time with UnSaid Memories.`,
      ],
    },
  };
  const c = copy[opts.kind];
  try {
    const r = await sendEmail({
      to: opts.to,
      template: `onboarding_${opts.kind}`,
      subject: c.subject,
      variables: toResendVariables({
        name,
        partnerType: opts.typeLabel,
        heading: c.heading,
        reason: opts.reason || undefined,
        message: opts.message || undefined,
      }),
      html: simpleEmail({
        preheader: c.heading,
        eyebrowText: "Application update",
        heading: c.heading,
        paragraphs: c.paragraphs,
        note: "— The UnSaid Memories partnerships team",
      }),
    });
    return !!r.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Per-type provisioning (steps 2 + 3), inside one withPg session
// ---------------------------------------------------------------------------

export interface ProvisionSummary {
  auth_user_id: string;
  auth_invited: boolean;
  auth_existed: boolean;
  portal_user_id: string | null;
  role_type: string;
  tenant_id: string;
  own_records: Record<string, unknown>;
  notes: string[];
}

export async function provisionActivation(
  c: DisplayCase,
  gates: OnboardingGate[],
  capabilities: DisplayCapability[],
  actor: string,
): Promise<ProvisionSummary> {
  const email = c.applicant_email ? String(c.applicant_email).trim().toLowerCase() : "";
  if (!email) throw new Error("Case carries no applicant email — cannot invite or link an auth account");
  const role = ROLE_FOR_TYPE[c.type];
  if (!role) throw new Error(`No activation role mapping for case type "${c.type}"`);
  const displayName = c.applicant_name || c.business_name || email.split("@")[0];
  const masterTenant = TENANT_ID();
  const notes: string[] = [];

  // Step 1 — auth user FIRST (portal_users.user_id is NOT NULL).
  const auth = await ensureAuthUser(email, displayName);

  const gateData = (k: string) => gates.find((g) => g.gateKey === k)?.data || {};
  const d = c.answers || {};
  const summary = await withPg(async (client) => {
    const own: Record<string, unknown> = {};
    let tenantId = masterTenant;
    let portalUserId: string | null = null;

    if (c.type === "franchise") {
      // The signup route's write set, replicated (it exports no helpers),
      // WITH user_id on portal_users + crm_staff.
      const businessName = c.business_name || displayName;
      const master = await client.query(
        `SELECT id::text AS id FROM public.tenants WHERE slug='all-about-portal' LIMIT 1`,
      );
      const masterId: string = master.rows[0]?.id || masterTenant;
      let slug = slugify(businessName) || "franchise";
      const clash = await client.query(
        `SELECT 1 FROM public.tenants WHERE slug=$1 UNION SELECT 1 FROM public.franchise_locations WHERE slug=$1 LIMIT 1`,
        [slug],
      );
      if ((clash.rowCount || 0) > 0) slug = `${slug}-${c.id.slice(0, 4)}`;
      const t = await client.query(
        `INSERT INTO public.tenants (parent_tenant_id, tenant_type, name, slug, status)
         VALUES ($1::uuid, 'franchise', $2, $3, 'active') RETURNING id::text AS id`,
        [masterId, businessName, slug],
      );
      tenantId = t.rows[0].id;
      const colCheck = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='template_key' LIMIT 1`,
      );
      if ((colCheck.rowCount || 0) > 0) {
        await client.query(`UPDATE public.tenants SET template_key='house' WHERE id=$1::uuid`, [tenantId]);
        own.template_assigned = true;
      }
      const brandCols = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name IN ('support_email','support_phone')`,
      );
      if ((brandCols.rowCount || 0) === 2) {
        await client.query(
          `UPDATE public.tenants SET support_email=$2, support_phone=$3 WHERE id=$1::uuid`,
          [tenantId, email, c.applicant_phone || null],
        );
        own.brand_initialized = true;
      }
      const loc = (Array.isArray(d.locations) ? d.locations[0] : null) || {};
      const fl = await client.query(
        `INSERT INTO public.franchise_locations
           (tenant_id, parent_tenant_id, business_name, slug, address_line1, address_line2, city, state, postal_code, phone, email, status)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active') RETURNING id::text AS id`,
        [
          tenantId, masterId, businessName, slug,
          loc.line1 || loc.address_line1 || d.address_line1 || null, loc.line2 || null,
          loc.city || d.city || null, loc.state || d.state || null, loc.postal_code || d.postal_code || null,
          c.applicant_phone || null, email,
        ],
      );
      own.franchise_location_id = fl.rows[0].id;
      if (await tableExists(client, "franchise_agreements")) {
        const ag = await client.query(
          `INSERT INTO public.franchise_agreements (tenant_id, parent_tenant_id, agreement_type, status, royalty_rate, fee_schedule)
           VALUES ($1::uuid,$2::uuid,'franchise','pending',$3,'{}'::jsonb) RETURNING id::text AS id`,
          [tenantId, masterId, d.royalty_rate ?? null],
        );
        own.agreement_id = ag.rows[0]?.id || null;
      }
      if (await tableExists(client, "tenant_locations")) {
        const address = {
          line1: loc.line1 || "", line2: loc.line2 || "", city: loc.city || "", state: loc.state || "",
          postal_code: loc.postal_code || "", phone: c.applicant_phone || "", email,
        };
        const tl = await client.query(
          `INSERT INTO public.tenant_locations (tenant_id, name, address, timezone, is_primary, is_active)
           VALUES ($1::uuid,$2,$3::jsonb,'America/Chicago',true,true) RETURNING id::text AS id`,
          [tenantId, `${businessName} — Main`, JSON.stringify(address)],
        );
        own.location_id = tl.rows[0]?.id || null;
      }
      portalUserId = await upsertPortalUser(client, {
        tenantId, userId: auth.userId, roleType: role.role_type, portal: role.portal,
        displayName, email, phone: c.applicant_phone, isOwner: true, actor,
      });
      await client.query(
        `UPDATE public.franchise_locations SET owner_portal_user_id=$1::uuid WHERE id=$2::uuid`,
        [portalUserId, fl.rows[0].id],
      );
      let grants = 0;
      if (await tableExists(client, "portal_module_permissions")) {
        for (const code of FRANCHISE_OWNER_MODULES) {
          const ins = await client.query(
            `INSERT INTO public.portal_module_permissions (tenant_id, portal_user_id, module_key, permission_level)
             VALUES ($1::uuid,$2::uuid,$3,'all')`,
            [tenantId, portalUserId, code],
          );
          grants += ins.rowCount || 0;
        }
      }
      own.module_grants = grants;
      if (await tableExists(client, "crm_staff")) {
        const { first, last } = splitName(displayName, email);
        const staff = await client.query(
          `INSERT INTO public.crm_staff (id, tenant_id, user_id, display_name, first_name, last_name, email, phone, role, is_service_staff, is_active)
           VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5,$6,$7,'owner',false,true)
           RETURNING id::text AS id`,
          [tenantId, auth.userId, displayName, first, last, email, c.applicant_phone],
        );
        own.crm_staff_id = staff?.rows?.[0]?.id || null;
        if (!own.crm_staff_id) notes.push("crm_staff owner row not created (insert refused) — module gates resolve the owner via portal_users.is_owner meanwhile");
      }
      if (await tableExists(client, "portal_permission_audit_log")) {
        await client.query(
          `INSERT INTO public.portal_permission_audit_log (tenant_id, portal_user_id, action, details)
           VALUES ($1::uuid,$2::uuid,'onboarding_engine_activation',$3::jsonb)`,
          [masterId, portalUserId, JSON.stringify({ case_id: c.id, tenant_id: tenantId, slug, actor })],
        ).catch(() => {});
      }
      own.slug = slug;
      return { tenantId, portalUserId, own };
    }

    // Every other type: portal_users on the master tenant.
    portalUserId = await upsertPortalUser(client, {
      tenantId: masterTenant, userId: auth.userId, roleType: role.role_type, portal: role.portal,
      displayName, email, phone: c.applicant_phone, isOwner: role.is_owner, actor,
    });

    if (c.type === "veterinarian") {
      const g6 = gateData("G6");
      const runVetProfile = async (profileKey: string) => {
      return await client.query(
        `INSERT INTO clinical.vet_profiles (tenant_id, portal_user_id, license_number, license_state, license_expires_at, specialty, clinic_name, status)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,'active')
         ON CONFLICT (tenant_id, portal_user_id)
         DO UPDATE SET license_number=EXCLUDED.license_number, license_state=EXCLUDED.license_state,
                       license_expires_at=EXCLUDED.license_expires_at, specialty=EXCLUDED.specialty,
                       clinic_name=EXCLUDED.clinic_name, status='active', updated_at=now()
         RETURNING id::text AS id`,
        [
          masterTenant, profileKey,
          g6.license_number || d.license_number || null,
          g6.license_state || d.license_state || d.primary_state || null,
          g6.license_expires_at || d.license_expires_at || null,
          g6.specialty || d.specialty || null,
          d.practice_name || c.business_name || null,
        ],
      );
      };
      let prof: AnyRow;
      try {
        prof = await runVetProfile(portalUserId);
      } catch {
        // Pre-existing portal_users row whose id != auth user id: the live
        // FK (portal_user_id → auth.users) refuses it. Write the profile
        // under the auth id so the row exists; readers keyed by the old
        // portal id will miss it — a host-schema inconsistency, noted.
        prof = await runVetProfile(auth.userId);
        own.vet_profile_key_note = "profile written under auth user id (pre-existing portal_users id differs; live FK references auth.users)";
      }
      own.vet_profile_id = prof.rows[0]?.id || null;

      // Roster row — the cabinet + provider profile read clinical.veterinarians
      // BY user_id (resolveTelemedVet); public presentation requires
      // credential_status='VERIFIED' AND status='active'. Create-or-link
      // WITH user_id set (the desk's create_veterinarian leaves it NULL
      // when no portal_users email match exists — nothing self-heals it).
      const { first, last } = splitName(c.applicant_name, displayName);
      const srcApp = c.source_application_id && UUID_RE.test(String(c.source_application_id))
        ? String(c.source_application_id) : null;
      let roster = { rows: [] as AnyRow[] };
      const metaRosterId = typeof c.metadata?.veterinarian_id === "string" ? c.metadata.veterinarian_id : null;
      if (metaRosterId && UUID_RE.test(metaRosterId)) {
        roster = await client.query(
          `SELECT id::text AS id FROM clinical.veterinarians WHERE tenant_id=$1::uuid AND id=$2::uuid LIMIT 1`,
          [masterTenant, metaRosterId],
        );
      }
      if (!roster.rows[0]) {
        roster = await client.query(
          `SELECT id::text AS id FROM clinical.veterinarians WHERE tenant_id=$1::uuid AND user_id=$2::uuid LIMIT 1`,
          [masterTenant, auth.userId],
        );
      }
      if (!roster.rows[0] && srcApp) {
        roster = await client.query(
          `SELECT id::text AS id FROM clinical.veterinarians WHERE tenant_id=$1::uuid AND source_application_id=$2::uuid LIMIT 1`,
          [masterTenant, srcApp],
        );
      }
      let rosterId: string | null = roster.rows[0]?.id || null;
      if (rosterId) {
        await client.query(
          `UPDATE clinical.veterinarians
              SET user_id=$2::uuid, credential_status='VERIFIED', credential_verified_at=COALESCE(credential_verified_at, now()), status='active'
            WHERE id=$1::uuid`,
          [rosterId, auth.userId],
        );
        own.veterinarians_roster = "linked_existing";
      } else {
        const ins = await client.query(
          `INSERT INTO clinical.veterinarians
             (tenant_id, user_id, first_name, last_name, specialties, credential_status, credential_verified_at, status, source_application_id)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,'VERIFIED',now(),'active',$6::uuid)
           RETURNING id::text AS id`,
          [
            masterTenant, auth.userId, first, last,
            d.specialty ? [String(d.specialty)] : null,
            srcApp,
          ],
        );
        rosterId = ins?.rows?.[0]?.id || null;
        own.veterinarians_roster = rosterId ? "created" : "failed";
        if (!rosterId) notes.push("clinical.veterinarians roster insert refused — cabinet/profile (resolveTelemedVet) will not resolve this vet until a roster row with user_id exists");
      }
      own.veterinarian_id = rosterId;

      // Per-state license rows from the case capabilities (the desk's
      // add_license/verify_license vocabulary, engine-side): only rows
      // with an expiry can be inserted (expires_at is NOT NULL in
      // practice on veterinarian_licenses).
      if (rosterId && (await tableExists(client, "veterinarian_licenses", "clinical"))) {
        let licCount = 0;
        for (const cap of capabilities) {
          if (!cap.jurisdiction || !cap.expires_at) continue;
          const ins = await client.query(
            `INSERT INTO clinical.veterinarian_licenses (vet_id, tenant_id, state_code, license_number, license_status, expires_at, verified_at)
             VALUES ($1::uuid,$2::uuid,$3,$4,'ACTIVE',$5::date,now())
             ON CONFLICT DO NOTHING`,
            [rosterId, masterTenant, String(cap.jurisdiction), cap.license_no || g6.license_number || "—", cap.expires_at],
          );
          licCount += ins?.rowCount || 0;
        }
        own.veterinarian_licenses_created = licCount;
      }

      // Legacy telemed linkage: stamp the source vet application approved
      // (the desk's activate does exactly this) so the join track derives
      // 'active' — applications are matched by email in the track read.
      if (srcApp && (await tableExists(client, "vet_partner_applications", "clinical"))) {
        const upd = await client.query(
          `UPDATE clinical.vet_partner_applications SET status='approved' WHERE id=$1::uuid AND status <> 'draft'`,
          [srcApp],
        );
        own.legacy_vet_application_stamped = (upd?.rowCount || 0) > 0;
      } else {
        notes.push("telemed linkage: no source vet_partner_applications id on the case — linkage rides the roster row (user_id) + vet_profiles (portal_user_id) instead");
      }
    }

    if (c.type === "pharmacy") {
      const g6 = gateData("G6");
      const runPharmacyProfile = async (profileKey: string) => {
      return await client.query(
        `INSERT INTO clinical.pharmacy_profiles (tenant_id, portal_user_id, license_number, license_state, license_expires_at, pharmacy_name, status)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,'active')
         ON CONFLICT (tenant_id, portal_user_id)
         DO UPDATE SET license_number=EXCLUDED.license_number, license_state=EXCLUDED.license_state,
                       license_expires_at=EXCLUDED.license_expires_at, pharmacy_name=EXCLUDED.pharmacy_name,
                       status='active', updated_at=now()
         RETURNING id::text AS id`,
        [
          masterTenant, profileKey,
          g6.license_number || d.license_number || null,
          g6.license_state || d.license_state || null,
          g6.license_expires_at || d.license_expires_at || null,
          d.pharmacy_name || c.business_name || null,
        ],
      );
      };
      let prof: AnyRow;
      try {
        prof = await runPharmacyProfile(portalUserId);
      } catch {
        prof = await runPharmacyProfile(auth.userId);
        own.pharmacy_profile_key_note = "profile written under auth user id (pre-existing portal_users id differs; live FK references auth.users)";
      }
      own.pharmacy_profile_id = prof.rows[0]?.id || null;
      // The §1.7 packet (DEA / Vet-VIPPS / insurance / W-9) continues to be
      // administered on this profile via /api/admin/telemed/partner.
      const srcApp = c.source_application_id && UUID_RE.test(String(c.source_application_id))
        ? String(c.source_application_id) : null;
      if (srcApp && (await tableExists(client, "pharmacy_partner_applications", "clinical"))) {
        const upd = await client.query(
          `UPDATE clinical.pharmacy_partner_applications SET status='approved' WHERE id=$1::uuid`,
          [srcApp],
        );
        own.legacy_pharmacy_application_stamped = (upd?.rowCount || 0) > 0;
      }
    }

    if (c.type === "groomer") {
      // Employee-portal data resolves via crm_staff.user_id — the row MUST
      // carry it (groomer-activation's row does not; that is the defect).
      if (await tableExists(client, "crm_staff")) {
        const { first, last } = splitName(displayName, email);
        const existing = await client.query(
          `SELECT id::text AS id FROM public.crm_staff WHERE tenant_id=$1::uuid AND user_id=$2::uuid LIMIT 1`,
          [masterTenant, auth.userId],
        );
        if (existing.rows[0]) {
          await client.query(`UPDATE public.crm_staff SET is_active=true, is_service_staff=true WHERE id=$1::uuid`, [existing.rows[0].id]);
          own.crm_staff_id = existing.rows[0].id;
          own.crm_staff = "linked_existing";
        } else {
          const ins = await client.query(
            `INSERT INTO public.crm_staff (id, tenant_id, user_id, display_name, first_name, last_name, email, phone, role, is_service_staff, is_active)
             VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5,$6,$7,'groomer',true,true)
             RETURNING id::text AS id`,
            [masterTenant, auth.userId, displayName, first, last, email, c.applicant_phone],
          );
          own.crm_staff_id = ins?.rows?.[0]?.id || null;
          own.crm_staff = own.crm_staff_id ? "created" : "failed";
        }
      }
      let grants = 0;
      if (await tableExists(client, "portal_module_permissions")) {
        for (const code of GROOMER_MODULES) {
          const ins = await client.query(
            `INSERT INTO public.portal_module_permissions (tenant_id, portal_user_id, module_key, permission_level)
             VALUES ($1::uuid,$2::uuid,$3,'all')
             ON CONFLICT DO NOTHING`,
            [masterTenant, portalUserId, code],
          );
          grants += (ins as AnyRow).rowCount || 0;
        }
      }
      own.module_grants = grants;
      let actions = 0;
      if (await tableExists(client, "portal_action_permissions")) {
        for (const key of GROOMER_ACTIONS) {
          const ins = await client.query(
            `INSERT INTO public.portal_action_permissions (tenant_id, portal_user_id, action_key, is_allowed)
             VALUES ($1::uuid,$2::uuid,$3,true)
             ON CONFLICT DO NOTHING`,
            [masterTenant, portalUserId, key],
          );
          actions += (ins as AnyRow).rowCount || 0;
        }
      }
      own.action_grants = actions;
    }

    if (c.type === "individual_seller" || c.type === "business_seller" || c.type === "manufacturer") {
      // Link to the EXISTING seller provisioning — do not rebuild it.
      const sellerRows = await client.query(
        `SELECT id::text AS id, business_name FROM public.sellers WHERE lower(email) = lower($1) LIMIT 1`,
        [email],
      );
      const seller = sellerRows.rows[0];
      if (seller) {
        const grants = await provisionSellerGrants(client as PgClientLike, {
          tenantId: masterTenant, sellerId: seller.id, actorId: UUID_RE.test(actor) ? actor : null,
        });
        own.seller_id = seller.id;
        own.seller_capabilities_created = grants.capabilitiesCreated;
        // Re-point the portal row at the seller (linkSellerPortalUser's shape).
        await client.query(
          `UPDATE public.portal_users SET parent_id=$2::uuid WHERE id=$1::uuid`,
          [portalUserId, seller.id],
        );
        own.seller_linkage = "sellers row matched by email; seller_capabilities provisioned; portal_users.parent_id set";
      } else {
        const appRows = await client.query(
          `SELECT id::text AS id FROM public.seller_partner_applications WHERE tenant_id=$1::uuid AND lower(email)=lower($2) ORDER BY created_at DESC LIMIT 1`,
          [masterTenant, email],
        );
        own.seller_linkage = appRows.rows[0]
          ? "seller_partner_applications row matched by email (no sellers row yet — the admin sellers approval flow creates it; engine portal_users seller row is in place)"
          : "no sellers / seller_partner_applications row matched by email — portal_users seller row created; seller record linkage pending the sellers flow";
        notes.push(String(own.seller_linkage));
      }
    }

    // Step 4 — the identity grant for the portal just provisioned
    // (Journey L21): adjoined to the identity's existing grants, so
    // finishing this onboarding from the account immediately makes the
    // new portal part of the person's set at their next sign-in —
    // not a portal_users row the grants-first resolver never re-reads.
    const grantShape = grantShapeFor(role.role_type, role.is_owner);
    if (grantShape && portalUserId) {
      const grantId = await issueIdentityGrant(client, {
        userId: auth.userId,
        tenantId,
        displayName,
        ...grantShape,
      }).catch(() => null);
      own.identity_grant = grantId
        ? { id: grantId, scope: grantShape.scope, membership_role: grantShape.membershipRole }
        : "issuance_failed";
      if (!grantId) {
        notes.push("identity grant issuance failed at activation — the resolver's legacy fallback self-populates a single grant from portal_users on first sign-in; re-run activation to adjoin the full set");
      }
    }

    return { tenantId, portalUserId, own };
  });

  if (!summary) throw new Error("Database unavailable during provisioning");
  return {
    auth_user_id: auth.userId,
    auth_invited: auth.invited,
    auth_existed: auth.existed,
    portal_user_id: summary.portalUserId,
    role_type: role.role_type,
    tenant_id: summary.tenantId,
    own_records: summary.own,
    notes,
  };
}

/** Suspend / offboard: deactivate the portal assignment so sign-in
 *  resolution (step 1b reads is_active) stops admitting the user. The
 *  identity grant issued at activation (step 4) flips WITH the row —
 *  the resolver is grants-first, so a grant left 'active' would keep
 *  admitting a suspended partner whose portal_users row is off.
 *  Reactivation restores both. Grant flips are best-effort beside the
 *  row update they mirror (the portal row stays the audited act). */
export async function setPortalAssignmentActive(caseUserId: string | null, email: string | null, active: boolean): Promise<number> {
  const flipGrants = async (userIds: string[]) => {
    for (const uid of userIds) {
      await pgQuery(
        `UPDATE public.identity_grants SET status=$2
          WHERE user_id=$1::uuid AND source='portal_users'`,
        [uid, active ? "active" : "inactive"],
      ).catch(() => []);
    }
  };
  if (caseUserId) {
    const n = await pgQueryStrict(
      `UPDATE public.portal_users SET is_active=$2, updated_at=now() WHERE user_id=$1::uuid`,
      [caseUserId, active],
    ).then(() => 1);
    if (n) await flipGrants([caseUserId]);
    return n;
  }
  if (email) {
    const rows = await pgQuery<AnyRow>(
      `UPDATE public.portal_users SET is_active=$2, updated_at=now() WHERE lower(email)=lower($1) RETURNING user_id`,
      [email, active],
    );
    if (rows.length) {
      await flipGrants([...new Set(rows.map((r) => String(r.user_id)).filter(Boolean))]);
    }
    return rows.length;
  }
  return 0;
}
