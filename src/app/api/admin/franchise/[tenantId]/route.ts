import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { resolveActiveTenantId } from "@/lib/admin/tenant-resolution";
import { MASTER_TENANT_ID } from "@/lib/site-tenant-shared";
import { isKnownTemplateKey } from "@/lib/site-templates-db";

/* /api/admin/franchise/[tenantId] — one franchise in the Franchise
 * Management Portal: identity, domain, branding, template, owner +
 * module entitlements, locations, agreement.
 *
 * GET   -> the full detail record.
 * PATCH -> master-side edits: status, name, domains (clash-checked the
 *          same way provisioning checks them), brand columns, template
 *          assignment. Entitlements are NOT edited here — they go
 *          through PUT /api/admin/users/permissions (the one grant
 *          writer: scope-filtered, audited, and mirrored into the
 *          platform grant store).
 *
 * Master-only on both verbs (see ../route.ts).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_STATUSES = new Set(["onboarding", "active", "suspended", "closed"]);

// camelCase request key -> tenants column (same brand columns the
// franchise owner edits for themselves in My Website).
const BRAND_FIELD_MAP: Record<string, string> = {
  logoUrl: "logo_url",
  logoDarkUrl: "logo_dark_url",
  faviconUrl: "favicon_url",
  primaryColor: "primary_color",
  secondaryColor: "secondary_color",
  accentColor: "accent_color",
  brandFont: "brand_font",
  supportEmail: "support_email",
  supportPhone: "support_phone",
  websiteUrl: "website_url",
};

/** True when the caller's resolved active tenant is NOT the master —
 *  franchise management is a master prerogative (see ../route.ts). */
async function notMaster(client: any, req: NextRequest): Promise<boolean> {
  return (await resolveActiveTenantId(client, req)) !== MASTER_TENANT_ID;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const { tenantId } = await params;
  if (!UUID_RE.test(tenantId)) return NextResponse.json({ error: "Invalid tenant id" }, { status: 400 });
  const out = await withPg(async (client) => {
    if (await notMaster(client, req)) {
      return NextResponse.json({ error: "Franchise management is a master-tenant surface." }, { status: 403 });
    }
    const t = await client.query(
      `SELECT id::text AS id, name, slug, status, tenant_type,
              parent_tenant_id::text AS parent_tenant_id,
              custom_domain, primary_domain, template_key, website_mode,
              logo_url, logo_dark_url, favicon_url,
              primary_color, secondary_color, accent_color, brand_font,
              support_email, support_phone, website_url, created_at
         FROM public.tenants WHERE id = $1::uuid AND tenant_type = 'franchise' LIMIT 1`,
      [tenantId],
    );
    const tenant = t.rows[0];
    if (!tenant) return NextResponse.json({ error: "Franchise tenant not found" }, { status: 404 });

    const o = await client.query(
      `SELECT id::text AS id, display_name, email, phone, is_owner, is_active,
              (user_id IS NOT NULL) AS auth_linked, created_at
         FROM public.portal_users
        WHERE tenant_id = $1::uuid AND role_type = 'franchise_owner'
        ORDER BY created_at LIMIT 1`,
      [tenantId],
    );
    const owner = o.rows[0] || null;

    let grants: Record<string, string> = {};
    if (owner) {
      const g = await client.query(
        `SELECT module_key, permission_level FROM public.portal_module_permissions
          WHERE portal_user_id = $1::uuid ORDER BY module_key`,
        [owner.id],
      );
      grants = Object.fromEntries(g.rows.map((r: any) => [r.module_key, r.permission_level]));
    }

    const loc = await client.query(
      `SELECT id::text AS id, location_name, city, state, wordpress_url, status, created_at
         FROM public.franchise_locations WHERE tenant_id = $1::uuid ORDER BY created_at`,
      [tenantId],
    );
    const ag = await client.query(
      `SELECT id::text AS id, status, royalty_rate, signed_at, created_at
         FROM public.franchise_agreements WHERE tenant_id = $1::uuid
        ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
    );
    const staff = await client.query(
      `SELECT count(*)::int AS n FROM public.crm_staff WHERE tenant_id = $1::uuid AND is_active = true`,
      [tenantId],
    );
    // WordPress connection summary (never the credential) — the
    // tenant's website is either its template or its WordPress;
    // tenant.website_mode (in the tenant row above) says which.
    const wp = await client.query(
      `SELECT site_url, username, status, site_name, wp_user_name, last_verified_at, last_error
         FROM public.tenant_wordpress_connections WHERE tenant_id = $1::uuid LIMIT 1`,
      [tenantId],
    ).catch(() => ({ rows: [] as any[] }));

    return NextResponse.json({
      data: {
        tenant,
        owner,
        grants,
        locations: loc.rows,
        agreement: ag.rows[0] || null,
        staffCount: staff.rows[0]?.n ?? 0,
        wordpress: wp.rows[0] || null,
      },
    });
  });
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const { tenantId } = await params;
  if (!UUID_RE.test(tenantId)) return NextResponse.json({ error: "Invalid tenant id" }, { status: 400 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const out = await withPg(async (client) => {
    if (await notMaster(client, req)) {
      return NextResponse.json({ error: "Franchise management is a master-tenant surface." }, { status: 403 });
    }
    const cur = await client.query(
      `SELECT id::text AS id FROM public.tenants WHERE id = $1::uuid AND tenant_type = 'franchise' LIMIT 1`,
      [tenantId],
    );
    if (!cur.rows[0]) return NextResponse.json({ error: "Franchise tenant not found" }, { status: 404 });

    const sets: string[] = [];
    const vals: any[] = [];
    const push = (col: string, v: any) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };

    if (body.status !== undefined) {
      if (!TENANT_STATUSES.has(String(body.status))) {
        return NextResponse.json({ error: "Unknown tenant status" }, { status: 400 });
      }
      push("status", String(body.status));
    }
    if (typeof body.name === "string" && body.name.trim()) push("name", body.name.trim());
    if (typeof body.slug === "string" && body.slug.trim()) push("slug", body.slug.trim().toLowerCase());

    for (const field of ["customDomain", "primaryDomain"] as const) {
      if (body[field] !== undefined) {
        const col = field === "customDomain" ? "custom_domain" : "primary_domain";
        const v = body[field] === null ? null : String(body[field]).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (v) {
          // Same clash rule as provisioning: the domain must not belong
          // to another tenant (either domain column).
          const clash = await client.query(
            `SELECT id::text AS id FROM public.tenants
              WHERE id <> $1::uuid AND (lower(custom_domain) = $2 OR lower(primary_domain) = $2) LIMIT 1`,
            [tenantId, v],
          );
          if (clash.rows[0]) {
            return NextResponse.json({ error: "That domain is already used by another tenant." }, { status: 409 });
          }
        }
        push(col, v);
      }
    }

    if (body.templateKey !== undefined) {
      const key = body.templateKey === null ? null : String(body.templateKey);
      if (key !== null && !(await isKnownTemplateKey(key))) {
        return NextResponse.json({ error: "Unknown template" }, { status: 400 });
      }
      push("template_key", key);
    }

    if (body.brand && typeof body.brand === "object") {
      for (const [key, col] of Object.entries(BRAND_FIELD_MAP)) {
        if (key in body.brand) {
          const v = body.brand[key];
          push(col, v === null || v === "" ? null : String(v));
        }
      }
    }

    if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    vals.push(tenantId);
    await client.query(
      `UPDATE public.tenants SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}::uuid`,
      vals,
    );
    return NextResponse.json({ success: true });
  });
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 });
}
