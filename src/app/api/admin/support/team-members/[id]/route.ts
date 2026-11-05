import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveTenantId } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// support_team_members [id] — availability / capacity updates from the
// profile page.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write");
  if (gate) return gate;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ["is_available", "max_concurrent", "role"]) {
    if (body[f] !== undefined) patch[f] = body[f];
  }
  const db = createServerClient();
  const { data, error } = await db.from("support_team_members").update(patch).eq("id", id).eq("tenant_id", resolveTenantId(req)).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}
