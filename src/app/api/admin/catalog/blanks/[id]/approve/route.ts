import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/catalog/blanks/[id]/approve { ready: boolean }
 * The render-ready gate from the play: a blank becomes designable only
 * after a Test Render has actually rendered and a person approves it.
 * Revoking is always allowed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { ready?: boolean };
  const sb = createServerClient();
  if (body.ready) {
    const { count } = await sb
      .from("renders")
      .select("id", { count: "exact", head: true })
      .eq("blank_id", id)
      .eq("purpose", "test")
      .eq("status", "rendered");
    if (!count) {
      return NextResponse.json(
        { error: "Run a Test Render first — a blank is approved on a render someone has seen." },
        { status: 422 }
      );
    }
  }
  const { error } = await sb
    .from("canonical_products")
    .update({ render_ready: !!body.ready })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Could not update the blank." }, { status: 500 });
  return NextResponse.json({ render_ready: !!body.ready });
}
