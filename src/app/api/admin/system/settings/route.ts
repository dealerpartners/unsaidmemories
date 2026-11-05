/**
 * /api/admin/system/settings — organization + settings sections.
 * Storage: `tenants` holds identity columns only; every section lives
 * in `tenant_settings` (see lib/admin/data.ts).
 * GET — the tenant's public fields plus every settings section
 *       (website, ecommerce, financial, operations, governance,
 *       documents, cms) and branding.
 * PUT — { section, values }:
 *         'organization' → name + status land on the tenant row
 *                          (is_active), the rest merges into the
 *                          'organization' settings section
 *         'branding'     → 'branding' settings section merge
 *         anything else  → that settings section, merged
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireModuleApi } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { getTenantRow, updateTenantBranding, updateTenantSettingsSection } from "@/lib/admin/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_SECTIONS = ["website", "ecommerce", "financial", "operations", "governance", "documents", "cms"] as const;

export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "read");
  if (mod) return mod;
  try {
    const tenant = await getTenantRow();
    if (!tenant) return NextResponse.json({ error: "Tenant row not found." }, { status: 404 });
    const sections: Record<string, Record<string, unknown>> = {};
    for (const s of SETTINGS_SECTIONS) sections[s] = (tenant.settings[s] as Record<string, unknown>) ?? {};
    return NextResponse.json({
      organization: {
        name: tenant.name,
        slug: tenant.slug,
        domain: tenant.domain,
        status: tenant.status,
        contact_email: tenant.contact_email,
        timezone: tenant.timezone,
        currency: tenant.currency,
      },
      branding: tenant.branding,
      sections,
      updated_at: tenant.updated_at,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Read failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "write");
  if (mod) return mod;
  try {
    const body = await req.json();
    const section = String(body.section || "");
    const values = (body.values ?? {}) as Record<string, unknown>;
    const db = createServerClient();

    if (section === "organization") {
      const orgValues: Record<string, unknown> = {};
      for (const k of ["domain", "contact_email", "timezone", "currency", "status"]) {
        if (typeof values[k] === "string") orgValues[k] = (values[k] as string).trim() || null;
      }
      const tenantPatch: Record<string, unknown> = {};
      if (typeof values.name === "string" && values.name.trim()) tenantPatch.name = values.name.trim();
      if (typeof values.status === "string") tenantPatch.is_active = values.status === "active";
      if (Object.keys(tenantPatch).length === 0 && Object.keys(orgValues).length === 0) {
        return NextResponse.json({ error: "No organization fields to update." }, { status: 400 });
      }
      if (Object.keys(tenantPatch).length > 0) {
        const { error } = await db.from("tenants").update(tenantPatch).eq("id", getTenantId());
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (Object.keys(orgValues).length > 0) await updateTenantSettingsSection("organization", orgValues);
      return NextResponse.json({ ok: true });
    }
    if (section === "branding") {
      await updateTenantBranding(values);
      return NextResponse.json({ ok: true });
    }
    if ((SETTINGS_SECTIONS as readonly string[]).includes(section)) {
      await updateTenantSettingsSection(section, values);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown settings section." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}
