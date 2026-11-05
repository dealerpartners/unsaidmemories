import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { parsePopup, unpublishOthers, updatePopup, getPopup } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

function numId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** GET /api/admin/website/popups/[id] — one pop-up (admin only). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const id = numId((await params).id);
  if (id === null) return NextResponse.json({ error: "Pop-up not found" }, { status: 404 });
  try {
    const popup = await getPopup(id);
    if (!popup) return NextResponse.json({ error: "Pop-up not found" }, { status: 404 });
    return NextResponse.json({ popup });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Read failed" }, { status: 500 });
  }
}

/** PATCH /api/admin/website/popups/[id] — edit / publish / unpublish. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const id = numId((await params).id);
  if (id === null) return NextResponse.json({ error: "Pop-up not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const { errors, data } = parsePopup(body);
  if (!data) return NextResponse.json({ errors }, { status: 400 });
  try {
    if (data.status === "published") {
      await unpublishOthers("popups", String(data.placement), id);
    }
    const popup = await updatePopup(id, data);
    if (!popup) return NextResponse.json({ error: "Pop-up not found" }, { status: 404 });
    return NextResponse.json({ popup });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}

// No DELETE route, by the owner's no-delete rule: a pop-up is taken
// down by unpublishing it (PATCH status draft), never deleted.
