import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdminApi } from "@/lib/admin/gate";
import { createPortal, listPortals, listPushes } from "@/lib/integrations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/integrations/partners — partner portals + recent pushes.
export async function GET(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const db = createServerClient();
  const productId = new URL(req.url).searchParams.get("productId") ?? undefined;
  const [portals, pushes] = await Promise.all([listPortals(db), listPushes(db, productId)]);
  return NextResponse.json({ portals, pushes });
}

// POST /api/admin/integrations/partners — register a partner portal.
// Body: { name, kind, ingestUrl, siteUrl }.
export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!String(body.name ?? "").trim()) {
    return NextResponse.json({ error: "Portal name is required." }, { status: 400 });
  }
  const db = createServerClient();
  try {
    const id = await createPortal(db, {
      name: String(body.name),
      kind: body.kind ? String(body.kind) : undefined,
      ingestUrl: body.ingestUrl ? String(body.ingestUrl) : undefined,
      siteUrl: body.siteUrl ? String(body.siteUrl) : undefined,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the portal." },
      { status: 400 }
    );
  }
}
