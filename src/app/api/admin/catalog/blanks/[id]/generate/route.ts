import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/catalog/blanks/[id]/generate { designId, colors?, dryRun? }
 * Loop B of the POD play, one blank at a time: the rules engine's
 * generate_products action queues renders for the design on this blank
 * (front + back, per color). Dry run reports the counts and queues
 * nothing. Colors default to White; a color may only be rendered when
 * its garment hex is actually known.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    designId?: string;
    colors?: Array<{ color: string; hex: string }>;
    dryRun?: boolean;
  };
  if (!body.designId) {
    return NextResponse.json({ error: "Pick a design first." }, { status: 400 });
  }
  const sb = createServerClient();
  const { data, error } = await sb.rpc("generate_products", {
    p_rule: { field: "id", op: "eq", value: id },
    p_design_id: body.designId,
    p_colors: body.colors ?? [],
    p_dry_run: body.dryRun !== false,
    p_actor: "admin-ui",
  });
  if (error) {
    return NextResponse.json(
      { error: "The generate step failed — the design may have no front print file." },
      { status: 502 }
    );
  }
  return NextResponse.json(data);
}
