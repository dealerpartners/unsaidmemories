import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// Built-in defaults used when the policy_settings table hasn't been
// migrated yet (migration: supabase/migrations/20261013_policy_settings.sql).
const DEFAULTS: Record<string, Record<string, string>> = {
  deposits: {
    enforce_24h: "true",
    auto_revenue_sweep: "true",
    vault_enabled: "true",
    default_deposit_cents: "2500",
  },
  refunds: {
    policy_mode: "strict",
    no_show_window_hours: "24",
    chargeback_fee_cents: "1500",
    approval_required_above_cents: "10000",
  },
};

// GET /api/admin/policy-settings?scope=deposits|refunds
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("policies", "read");
  if (gate) return gate;
  const scope = req.nextUrl.searchParams.get("scope") || "deposits";
  const defaults = DEFAULTS[scope] || {};
  const data = await withPg(async (c) => {
    const tenant = resolveTenantId(req);
    try {
      const r = await c.query(
        `SELECT key, value FROM public.policy_settings WHERE tenant_id = $1 AND scope = $2`,
        [tenant, scope],
      );
      const settings: Record<string, string> = { ...defaults };
      for (const row of r.rows) settings[row.key] = row.value;
      return { settings, persisted: true };
    } catch (e: any) {
      // Table not migrated yet — serve defaults honestly.
      if (String(e?.message || "").includes("policy_settings")) {
        return { settings: { ...defaults }, persisted: false, warning: "policy_settings table not migrated; showing defaults" };
      }
      throw e;
    }
  });
  return NextResponse.json(data || { settings: { ...defaults }, persisted: false });
}

// PUT /api/admin/policy-settings  { scope, settings: { key: value } }
export async function PUT(req: NextRequest) {
  const gate = await requireModuleApi("policies", "write");
  if (gate) return gate;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const scope = String(body.scope || "deposits");
  const settings = body.settings || {};
  if (typeof settings !== "object" || Array.isArray(settings)) {
    return NextResponse.json({ error: "settings must be an object" }, { status: 400 });
  }
  const data = await withPg(async (c) => {
    const tenant = resolveTenantId(req);
    try {
      for (const [key, value] of Object.entries(settings)) {
        await c.query(
          `INSERT INTO public.policy_settings (tenant_id, scope, key, value, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (tenant_id, scope, key)
           DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [tenant, scope, String(key), String(value)],
        );
      }
      return { ok: true, persisted: true };
    } catch (e: any) {
      if (String(e?.message || "").includes("policy_settings")) {
        return NextResponse.json(
          { error: "policy_settings table not migrated — run supabase/migrations/20261013_policy_settings.sql" },
          { status: 503 },
        );
      }
      throw e;
    }
  });
  if (data instanceof NextResponse) return data;
  return NextResponse.json(data || { ok: false });
}
