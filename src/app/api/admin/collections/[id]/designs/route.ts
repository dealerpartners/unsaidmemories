import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/collections/[id]/designs — bulk file designs into a
 * collection folder (or pull them out with mode:"remove"). This is the
 * "select items created over time, file them under one collection"
 * action from the studio and the Products review queue.
 *
 * Body: { designIds: string[], mode?: "add" | "remove" }
 */
/**
 * GET /api/admin/collections/[id]/designs — member design ids of a
 * collection. The studio's Rule A supplier gate uses this to check a
 * design against its target collection before publish.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const db = createServerClient();
    const { data, error } = await db
      .from("designs")
      .select("id")
      .eq("collection_id", id);
    if (error) throw error;
    return NextResponse.json({ designIds: (data ?? []).map((d: any) => d.id) });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load collection designs" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const body = await req.json();
    const designIds: string[] = body?.designIds ?? [];
    const mode: string = body?.mode ?? "add";
    if (!designIds.length) {
      return NextResponse.json({ error: "designIds is required" }, { status: 400 });
    }
    const db = createServerClient();

    const { data: collection, error: cErr } = await db
      .from("collections")
      .select("id, name")
      .eq("id", id)
      .single();
    if (cErr || !collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const { data, error } = await db
      .from("designs")
      .update({ collection_id: mode === "remove" ? null : id })
      .in("id", designIds)
      .select("id");
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      collection: { id: collection.id, name: collection.name },
      updated: data?.length ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
