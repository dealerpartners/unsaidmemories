import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { TENANT_ID, withPg } from "@/lib/crm/enterprise";
import { getSupabaseAdmin } from "@/lib/portal-auth";
import { sendEmail } from "@/lib/email";
import { esc, simpleEmail } from "@/lib/email/design";

/* POST /api/admin/franchise/signup — full franchise onboarding in one call.
 *
 * Body: {
 *   businessName, slug, ownerName, ownerEmail, ownerPhone?,
 *   address_line1?, address_line2?, city?, state?, postal_code?, phone?, email?,
 *   wordpress_url?, domain?, royalty_rate?, sendInvite?: boolean
 * }
 *
 * Creates:
 *   1. tenants row (tenant_type='franchise', parent = all-about-portal master;
 *      custom_domain set when `domain` is provided)
 *   1b. Starter website assignment: tenants.template_key = 'house' (the
 *       default site template) — guarded on migration 20261099's column
 *       existing; the response's provisioning summary reports the skip
 *       honestly when it does not
 *   1c. Brand columns initialized from the application (tenants
 *       .support_email / support_phone) — same guarded pattern
 *   1d. Starter site content: the master tenant's cms_global_content
 *       rows cloned to the new tenant (tenant-owned from birth), with
 *       the application's contact facts overlaid on the cloned values
 *   2. franchise_locations row (business record, slug, WP url)
 *   3. franchise_agreements row (pending until signed)
 *   4. tenant_locations row (primary physical location)
 *   5. The owner's auth account (found by email or invited/created —
 *      portal_users.user_id is NOT NULL + FK, so the account must exist
 *      first), then the portal_users row (role_type='franchise_owner',
 *      is_owner=true, user_id = the account)
 *   5b. Module grants for the owner: portal_module_permissions rows for
 *       every franchise-scope module at 'all' (master-only modules are
 *       never granted) + a crm_staff 'owner' record on the new tenant
 *       so the platform module gates resolve the owner by email
 *   6. portal_permission_audit_log row
 *   7. Invite email to the owner (when sendInvite !== false and email present)
 *
 * The response carries a `provisioning` summary whose counts come from
 * the actual insert results — never hardcoded success.
 */

async function tableExists(client: any, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [table],
  );
  return r.rowCount > 0;
}

// Franchise-scope module codes — mirrors the module tree in
// /api/admin/users/permissions (the modules whose scopes include
// "franchise"). A franchise owner is provisioned 'all' on exactly this
// set: the master-only modules (sellers, trust_safety, ai_ops, policies
// — src/lib/franchise-access.ts MASTER_ONLY_MODULES) are never in it.
const FRANCHISE_OWNER_MODULES = [
  "crm", "customers", "leads", "appointments", "communications",
  "accounting", "payments", "invoices", "deposits", "refunds_disputes",
  "gift_cards_credits", "orders", "inventory", "products_services",
  "purchasing", "shipping", "marketing", "analytics", "reports",
  "staff_groomer_management",
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const businessName = String(body?.businessName || "").trim();
  const ownerName = String(body?.ownerName || "").trim();
  const ownerEmail = String(body?.ownerEmail || "").trim();
  if (!businessName) return NextResponse.json({ error: "businessName is required" }, { status: 400 });
  if (!ownerName) return NextResponse.json({ error: "ownerName is required" }, { status: 400 });
  if (!ownerEmail) return NextResponse.json({ error: "ownerEmail is required" }, { status: 400 });

  const slug = slugify(String(body?.slug || businessName));
  if (!slug) return NextResponse.json({ error: "Could not derive a URL slug from the business name" }, { status: 400 });

  // Optional custom domain for the tenant's storefront (S5/S7): the host
  // the public site resolves back to this tenant. Normalized (scheme /
  // path stripped, lowercased) and shape-validated before it is stored
  // on tenants.custom_domain.
  const rawDomain = String(body?.domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const domain = rawDomain || null;
  if (domain && !/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: `"${domain}" is not a valid domain` }, { status: 400 });
  }

  try {
    const result = await withPg(async (client) => {
      if (!(await tableExists(client, "tenants"))) return { error: "tenants table missing" };
      if (!(await tableExists(client, "franchise_locations"))) {
        return { error: "franchise_locations table missing — run the franchise permissions schema first" };
      }

      // Master tenant.
      const master = await client.query(
        `SELECT id::text AS id FROM public.tenants WHERE slug='all-about-portal' LIMIT 1`,
      );
      const masterId: string = master.rows[0]?.id || TENANT_ID();

      // Slug must be unique across tenants + franchise locations.
      const clash = await client.query(
        `SELECT 1 FROM public.tenants WHERE slug=$1
          UNION SELECT 1 FROM public.franchise_locations WHERE slug=$1 LIMIT 1`,
        [slug],
      );
      if ((clash.rowCount || 0) > 0) return { error: `Slug "${slug}" is already taken` };

      // The domain must not already route to another tenant (S5 host
      // resolution matches custom_domain / primary_domain).
      if (domain) {
        const dClash = await client.query(
          `SELECT 1 FROM public.tenants
            WHERE lower(custom_domain) = $1 OR lower(primary_domain) = $1 LIMIT 1`,
          [domain],
        );
        if ((dClash.rowCount || 0) > 0) {
          return { error: `Domain "${domain}" is already assigned to another tenant` };
        }
      }

      // 1. Franchise tenant.
      const t = await client.query(
        `INSERT INTO public.tenants (parent_tenant_id, tenant_type, name, slug, status, custom_domain)
         VALUES ($1::uuid, 'franchise', $2, $3, 'active', $4)
         RETURNING id::text AS id`,
        [masterId, businessName, slug, domain],
      );
      const tenantId: string = t.rows[0].id;

      // 1b. Starter website assignment (S7): the franchise is born with
      // the default site template — "house", DEFAULT_TEMPLATE_KEY in
      // @/lib/site-templates — so its My Website surface and public site
      // have a template from day one. Guarded on the column existing:
      // migration 20261099 may not be applied yet, and a missing column
      // must not fail the signup; the provisioning summary reports the
      // skip (read-time default still applies the same template).
      let templateAssigned = false;
      let templateNote: string | null = null;
      const colCheck = await client.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'template_key'
          LIMIT 1`,
      );
      if ((colCheck.rowCount || 0) > 0) {
        await client.query(
          `UPDATE public.tenants SET template_key = 'house' WHERE id = $1::uuid`,
          [tenantId],
        );
        templateAssigned = true;
      } else {
        templateNote =
          "tenants.template_key missing (migration 20261099 not applied) — assignment skipped; the default template still applies at read time";
      }

      // 1c. Brand columns initialized from the application (S7): the
      // tenant's public identity starts as the shop's own contact facts,
      // not the master's. Guarded on the columns existing, same pattern
      // as 1b — a missing column must not fail the signup.
      let brandInitialized = false;
      const brandColCheck = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tenants'
            AND column_name IN ('support_email', 'support_phone')`,
      );
      if ((brandColCheck.rowCount || 0) === 2) {
        await client.query(
          `UPDATE public.tenants SET support_email = $2, support_phone = $3 WHERE id = $1::uuid`,
          [
            tenantId,
            String(body?.email || ownerEmail) || null,
            String(body?.phone || body?.ownerPhone || "") || null,
          ],
        );
        brandInitialized = true;
      }

      // 1d. Starter site content (S7): clone the master tenant's
      // cms_global_content rows to the new tenant so its site settings,
      // hours, contact and footer content are tenant-owned from birth —
      // the owner edits copies, never master rows. The application's own
      // contact facts overlay the cloned values (a new shop's phone is
      // the shop's phone, not headquarters'). Application values for
      // keys the master set lacks are inserted too. Counts are real:
      // they come from the insert results.
      let starterContentRows = 0;
      let starterContentNote: string | null = null;
      if (await tableExists(client, "cms_global_content")) {
        const overlay: Record<string, string> = {};
        const put = (k: string, v: unknown) => {
          const s = String(v || "").trim();
          if (s) overlay[k] = s;
        };
        put("phone", body?.phone);
        put("email", body?.email || ownerEmail);
        put("addressLine1", body?.address_line1);
        put("addressLine2", body?.address_line2);
        put("city", body?.city);
        put("state", body?.state);
        put("postalCode", body?.postal_code);
        const masterRows = await client.query(
          `SELECT content_key, label, value_text, content_group, locale
             FROM public.cms_global_content WHERE tenant_id = $1::uuid`,
          [masterId],
        );
        const seen = new Set<string>();
        for (const r of masterRows.rows) {
          const key = String(r.content_key);
          seen.add(`${key}|${r.locale || "en-US"}`);
          const value = overlay[key] !== undefined ? overlay[key] : r.value_text;
          const ins = await client.query(
            `INSERT INTO public.cms_global_content
               (tenant_id, content_key, label, value_text, content_group, locale)
             VALUES ($1::uuid, $2, $3, $4, $5, $6)`,
            [tenantId, key, r.label, value, r.content_group, r.locale || "en-US"],
          );
          starterContentRows += ins.rowCount || 0;
        }
        for (const [key, value] of Object.entries(overlay)) {
          if (seen.has(`${key}|en-US`)) continue;
          const group = ["phone", "email", "addressLine1", "addressLine2", "city", "state", "postalCode"].includes(key)
            ? "contact"
            : "general";
          const ins = await client.query(
            `INSERT INTO public.cms_global_content
               (tenant_id, content_key, label, value_text, content_group, locale)
             VALUES ($1::uuid, $2, $3, $4, $5, 'en-US')`,
            [tenantId, key, key, value, group],
          );
          starterContentRows += ins.rowCount || 0;
        }
        if (starterContentRows === 0) {
          starterContentNote =
            "master tenant holds no cms_global_content rows and the application supplied no contact facts — no starter content cloned (the site still renders complete from template defaults)";
        }
      } else {
        starterContentNote = "cms_global_content table missing — starter content not cloned";
      }

      // 2. Franchise business record.
      const fl = await client.query(
        `INSERT INTO public.franchise_locations
           (tenant_id, parent_tenant_id, business_name, slug,
            address_line1, address_line2, city, state, postal_code,
            phone, email, wordpress_url, status)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
         RETURNING id::text AS id`,
        [
          tenantId,
          masterId,
          businessName,
          slug,
          String(body?.address_line1 || "") || null,
          String(body?.address_line2 || "") || null,
          String(body?.city || "") || null,
          String(body?.state || "") || null,
          String(body?.postal_code || "") || null,
          String(body?.phone || "") || null,
          String(body?.email || ownerEmail) || null,
          String(body?.wordpress_url || "") || null,
        ],
      );
      const franchiseLocationId: string = fl.rows[0].id;

      // 3. Agreement (pending signature).
      let agreementId: string | null = null;
      if (await tableExists(client, "franchise_agreements")) {
        const ag = await client.query(
          `INSERT INTO public.franchise_agreements
             (tenant_id, parent_tenant_id, agreement_type, status, royalty_rate, fee_schedule)
           VALUES ($1::uuid, $2::uuid, 'franchise', 'pending', $3, '{}'::jsonb)
           RETURNING id::text AS id`,
          [tenantId, masterId, body?.royalty_rate ?? null],
        );
        agreementId = ag.rows[0]?.id || null;
      }

      // 4. Primary physical location on the franchise tenant.
      let locationId: string | null = null;
      if (await tableExists(client, "tenant_locations")) {
        const address = {
          line1: String(body?.address_line1 || ""),
          line2: String(body?.address_line2 || ""),
          city: String(body?.city || ""),
          state: String(body?.state || ""),
          postal_code: String(body?.postal_code || ""),
          phone: String(body?.phone || ""),
          email: String(body?.email || ownerEmail),
        };
        const loc = await client.query(
          `INSERT INTO public.tenant_locations
             (tenant_id, name, address, timezone, is_primary, is_active)
           VALUES ($1::uuid, $2, $3::jsonb, 'America/Chicago', true, true)
           RETURNING id::text AS id`,
          [tenantId, `${businessName} — Main`, JSON.stringify(address)],
        );
        locationId = loc.rows[0]?.id || null;
      }

      // 5. Franchise owner portal user (mini-owner of their tenant).
      let portalUserId: string | null = null;
      let moduleGrants = 0;
      let moduleGrantsNote: string | null = null;
      let staffRecord: string | null = null;
      let ownerAuthUserId: string | null = null;
      // The owner's AUTH ACCOUNT comes first: portal_users.user_id is
      // NOT NULL with an FK to auth.users, so the owner row cannot be
      // written before the account exists — the previous version of
      // this step omitted user_id entirely, the insert violated the
      // constraint, and provisioning died here (tenant, locations and
      // agreement committed; owner, grants, staff and audit never
      // written; the owner could never sign in). Find the account by
      // email, else invite/create it — the same find-or-invite pattern
      // as Settings → Users and employee provisioning.
      if (ownerEmail) {
        const found = await client
          .query(`SELECT id::text AS id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1`, [ownerEmail])
          .catch(() => ({ rows: [] as any[] }));
        ownerAuthUserId = found.rows[0]?.id || null;
        if (!ownerAuthUserId) {
          const admin = getSupabaseAdmin();
          if (admin) {
            const inv: any = await admin.auth.admin
              .inviteUserByEmail(ownerEmail)
              .catch(() => null);
            ownerAuthUserId = inv?.data?.user?.id || null;
            if (!ownerAuthUserId) {
              const created: any = await admin.auth.admin
                .createUser({
                  email: ownerEmail,
                  email_confirm: true,
                  user_metadata: { full_name: ownerName },
                })
                .catch(() => null);
              ownerAuthUserId = created?.data?.user?.id || null;
            }
          }
        }
      }
      if (await tableExists(client, "portal_users")) {
        if (!ownerAuthUserId) {
          moduleGrantsNote =
            "owner auth account could not be found or created — portal user, grants and staff record NOT provisioned; add the owner from Settings → Users (it links the account) before they sign in";
        }
        const pu = ownerAuthUserId
          ? await client.query(
              `INSERT INTO public.portal_users
                 (tenant_id, role_type, portal, display_name, email, phone, is_owner, is_active, user_id)
               VALUES ($1::uuid, 'franchise_owner', 'admin', $2, $3, $4, true, true, $5::uuid)
               RETURNING id::text AS id`,
              [tenantId, ownerName, ownerEmail, String(body?.ownerPhone || "") || null, ownerAuthUserId],
            )
          : { rows: [] as any[] };
        portalUserId = pu.rows[0]?.id || null;

        if (portalUserId) {
        // Link owner to the franchise record.
        await client.query(
          `UPDATE public.franchise_locations SET owner_portal_user_id=$1::uuid WHERE id=$2::uuid`,
          [portalUserId, franchiseLocationId],
        );

        // 5b. Module grants for the franchise owner (S7): the owner is
        // born able to run their shop — every franchise-scope module at
        // 'all' in the franchise grant store (the same rows Settings →
        // Users would write), never a master-only module. Plus a
        // crm_staff 'owner' record on the new tenant: the platform
        // module gates (requireModuleApi) resolve staff by email and
        // treat a tenant's owner record as full access, while the
        // franchise deny rule still bars master-only modules. Counts
        // are the real insert results.
        if (await tableExists(client, "portal_module_permissions")) {
          for (const code of FRANCHISE_OWNER_MODULES) {
            const ins = await client.query(
              `INSERT INTO public.portal_module_permissions
                 (tenant_id, portal_user_id, module_key, permission_level)
               VALUES ($1::uuid, $2::uuid, $3, 'all')`,
              [tenantId, portalUserId, code],
            );
            moduleGrants += ins.rowCount || 0;
          }
        } else {
          moduleGrantsNote = "portal_module_permissions table missing — module grants not provisioned";
        }
        if (await tableExists(client, "crm_staff")) {
          const nameParts = ownerName.split(/\s+/).filter(Boolean);
          const ins = await client.query(
            `INSERT INTO public.crm_staff
               (id, tenant_id, display_name, first_name, last_name, email, phone, role, is_service_staff, is_active, user_id)
             VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6, 'owner', false, true, $7::uuid)
             RETURNING id::text AS id`,
            [
              tenantId,
              ownerName,
              nameParts[0] || ownerName,
              nameParts.slice(1).join(" ") || null,
              ownerEmail,
              String(body?.ownerPhone || "") || null,
              ownerAuthUserId,
            ],
          ).catch(() => null);
          staffRecord = ins?.rows?.[0]?.id || null;
          if (!staffRecord) {
            moduleGrantsNote = [moduleGrantsNote, "crm_staff owner record not created (insert refused) — platform module gates will not resolve the owner until one exists"]
              .filter(Boolean)
              .join("; ");
          }
        }

        // 6. Audit.
        if (await tableExists(client, "portal_permission_audit_log")) {
          await client.query(
            `INSERT INTO public.portal_permission_audit_log
               (tenant_id, portal_user_id, action, details)
             VALUES ($1::uuid, $2::uuid, 'franchise_signup',
                     $3::jsonb)`,
            [
              masterId,
              portalUserId,
              JSON.stringify({ businessName, slug, tenant_id: tenantId }),
            ],
          ).catch(() => {});
        }
        } // portalUserId — link/grants/staff/audit exist only with the owner row
      }

      return {
        tenantId, franchiseLocationId, agreementId, locationId, portalUserId, slug,
        templateAssigned, templateNote, domain,
        brandInitialized, starterContentRows, starterContentNote,
        moduleGrants, moduleGrantsNote, staffRecord, ownerAuthUserId,
      };
    });

    if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 502 });
    if ((result as any).error) return NextResponse.json({ error: (result as any).error }, { status: 400 });

    // 7. Invite email (fire-and-forget; signup succeeds even if email fails).
    let emailSent = false;
    if (body?.sendInvite !== false && ownerEmail) {
      try {
        // The invite hands the owner their franchise's own front door: the
        // vanity URL created for the tenant (its custom domain, provisioned
        // with the franchise code). It must never link the corporate /admin
        // login door — advertising the platform's login page invites
        // attacks, and the franchisee's entry is their vanity URL.
        const vanityUrl = domain ? `https://${domain}` : null;
        const r = await sendEmail({
          to: ownerEmail,
          template: "franchise-invite",
          subject: `Welcome to UnSaid Memories — ${businessName} franchise onboarding`,
          html: simpleEmail({
            preheader: `Your ${businessName} franchise shop is set up.`,
            eyebrowText: "Franchise onboarding",
            heading: `Welcome, ${ownerName}!`,
            paragraphs: [
              `Your <strong>${esc(businessName)}</strong> franchise shop is set up on the UnSaid Memories platform.`,
              "Your franchise portal is the same admin portal our corporate stores use — CRM, appointments, accounting, and inventory — with your view fenced to your business: your franchise is its own workspace under the UnSaid Memories master, and everything you see is filtered to your shop.",
              "<strong>Next steps:</strong>",
              `1. Sign in to your franchise portal and complete your business profile.<br/>2. Add your locations, staff, and services.<br/>3. Connect your storefront website${body?.wordpress_url ? ` (${esc(body.wordpress_url)})` : ""} to your shop.`,
              ...(vanityUrl
                ? []
                : ["Your portal's vanity URL is being finalized for your franchise code — the UnSaid Memories team will send it to this email address."]),
            ],
            cta: vanityUrl
              ? { href: vanityUrl, label: "Open your franchise portal" }
              : undefined,
            note: "— The UnSaid Memories team",
          }),
        });
        emailSent = !!r.ok;
      } catch {
        emailSent = false;
      }
    }

    return NextResponse.json(
      {
        data: {
          tenant_id: (result as any).tenantId,
          franchise_location_id: (result as any).franchiseLocationId,
          agreement_id: (result as any).agreementId,
          location_id: (result as any).locationId,
          portal_user_id: (result as any).portalUserId,
          slug: (result as any).slug,
          email_sent: emailSent,
          // S7 provisioning summary — every count below is derived from
          // the actual insert results above, never hardcoded.
          provisioning: {
            tenants: 1,
            franchise_locations: 1,
            agreements: (result as any).agreementId ? 1 : 0,
            locations: (result as any).locationId ? 1 : 0,
            portal_users: (result as any).portalUserId ? 1 : 0,
            owner_auth_linked: !!(result as any).ownerAuthUserId,
            template: {
              assigned: !!(result as any).templateAssigned,
              key: (result as any).templateAssigned ? "house" : null,
              ...((result as any).templateNote
                ? { note: (result as any).templateNote }
                : {}),
            },
            brand_initialized: !!(result as any).brandInitialized,
            starter_content_rows: (result as any).starterContentRows || 0,
            ...((result as any).starterContentNote
              ? { starter_content_note: (result as any).starterContentNote }
              : {}),
            module_grants: (result as any).moduleGrants || 0,
            staff_record_created: !!(result as any).staffRecord,
            ...((result as any).moduleGrantsNote
              ? { module_grants_note: (result as any).moduleGrantsNote }
              : {}),
            domain: (result as any).domain || null,
            invite_email_sent: emailSent,
          },
        },
      },
      { status: 201 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "franchise signup failed" }, { status: 500 });
  }
}
