import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveTenantId } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// support_automations — list + create for the Support Desk pages (owner's v2 comp).
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("support", "read");
  if (gate) return gate;
  const db = createServerClient();
  const { data, error } = await db.from("support_automations").select("*").eq("tenant_id", resolveTenantId(req)).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("support", "write");
  if (gate) return gate;
  const body = await req.json().catch(() => ({}));
  const row: Record<string, unknown> = { tenant_id: resolveTenantId(req) };
  for (const f of ['name', 'trigger_event', 'conditions', 'actions', 'is_active']) {
    if (body[f] !== undefined && body[f] !== "") row[f] = body[f];
  }
  const db = createServerClient();
  const { data, error } = await db.from("support_automations").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}
