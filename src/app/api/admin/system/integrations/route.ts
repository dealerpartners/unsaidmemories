/**
 * /api/admin/system/integrations — Integrations settings data.
 * GET   — provider configuration status: for each integration, which
 *         env keys are present (names + booleans only — values are
 *         never returned), the matching suppliers-table row when one
 *         exists, and integration_secrets rows (metadata only).
 * PATCH — update a supplier row: { id, ordering_status?, api_base_url? }.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireModuleApi } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { PROVIDERS } from "@/lib/admin/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "read");
  if (mod) return mod;
  try {
    const db = createServerClient();
    const { data: suppliers } = await db
      .from("suppliers")
      .select("id, name, slug, kind, catalog_source, api_base_url, ordering_status, created_at")
      .order("name");
    const bySlug = new Map((suppliers ?? []).map((s) => [String(s.slug ?? "").toLowerCase(), s]));

    let secrets: Array<Record<string, unknown>> = [];
    try {
      const { data } = await db.from("integration_secrets").select("*").limit(50);
      secrets = (data ?? []).map((row) => {
        const safe: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
          if (/secret|key|token|value/i.test(k) && typeof v === "string" && v.length > 0) safe[k] = "••••••••";
          else safe[k] = v;
        }
        return safe;
      });
    } catch { /* table optional */ }

    return NextResponse.json({
      providers: PROVIDERS.map((p) => ({
        ...p,
        envStatus: p.env.map((name) => ({ name, present: Boolean(process.env[name]?.trim()) })),
        configured: p.env.every((name) => Boolean(process.env[name]?.trim())),
        supplier: p.supplierSlug ? bySlug.get(p.supplierSlug) ?? null : null,
      })),
      suppliers: suppliers ?? [],
      secrets,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Read failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "write");
  if (mod) return mod;
  try {
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "Supplier id is required." }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (typeof body.ordering_status === "string") patch.ordering_status = body.ordering_status;
    if (typeof body.api_base_url === "string") patch.api_base_url = body.api_base_url.trim() || null;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    const db = createServerClient();
    const { error } = await db.from("suppliers").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, tenant: getTenantId() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}
