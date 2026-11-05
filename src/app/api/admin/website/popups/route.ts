import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { parsePopup, unpublishOthers, insertPopup, listPopups } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/** GET /api/admin/website/popups — list pop-ups (admin only). */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const popups = await listPopups(
      req.nextUrl.searchParams.get("placement"),
      req.nextUrl.searchParams.get("status"),
    );
    return NextResponse.json({ popups });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Read failed" }, { status: 500 });
  }
}

/** POST /api/admin/website/popups — create a pop-up (admin only). */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const body = await req.json().catch(() => null);
  const { errors, data } = parsePopup(body);
  if (!data) return NextResponse.json({ errors }, { status: 400 });
  try {
    if (data.status === "published") {
      await unpublishOthers("popups", String(data.placement));
    }
    const popup = await insertPopup(data, gate.context?.email ?? null);
    return NextResponse.json({ popup }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}
