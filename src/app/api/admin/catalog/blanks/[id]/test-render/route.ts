import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { TEST_ARTWORK_REF } from "@/lib/fabric/blanks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/catalog/blanks/[id]/test-render — queue a Test Render.
 * The render worker (a queue job, never a serverless request — Sunny's
 * play) executes it and fills in the result. Body may override the view
 * and color; defaults: front view, White garment (the ghost asset IS a
 * white garment, so white needs no tint guesswork).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    view?: string;
    color?: string;
    colorHex?: string;
  };
  const sb = createServerClient();
  const { data: asset } = await sb
    .from("blank_assets")
    .select("id")
    .eq("blank_id", id)
    .eq("view", body.view ?? "front")
    .eq("kind", "shading")
    .not("box_w_in", "is", null)
    .limit(1)
    .single();
  if (!asset) {
    return NextResponse.json(
      { error: "This blank has no print-area box for that view yet — its assets come first." },
      { status: 422 }
    );
  }
  const { data, error } = await sb
    .from("renders")
    .insert({
      blank_id: id,
      view: body.view ?? "front",
      color: body.color ?? "White",
      color_hex: body.colorHex ?? "#ffffff",
      design_ref: TEST_ARTWORK_REF,
      purpose: "test",
      status: "queued",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "Could not queue the test render." }, { status: 500 });
  return NextResponse.json({ queued: data.id });
}
