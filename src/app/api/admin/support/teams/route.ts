import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveTenantId } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// support_teams — list + create for the Support Desk pages (owner's v2 comp).
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("support", "read");
  if (gate) return gate;
  const db = createServerClient();
  const { data, error } = await db.from("support_teams").select("*").eq("tenant_id", resolveTenantId(req)).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("support", "write");
  if (gate) return gate;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  const db = createServerClient();
  const { data, error } = await db.from("support_teams")
    .insert({ tenant_id: resolveTenantId(req), name, description: body.description ?? null, code: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) })
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}
