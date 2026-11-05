import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdminApi } from "@/lib/admin/gate";
import { pushProductToPortal } from "@/lib/integrations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/integrations/partners/push — push a published product
// to a partner portal. Body: { portalId, productId }.
export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!body.portalId || !body.productId) {
    return NextResponse.json({ error: "portalId and productId are required." }, { status: 400 });
  }
  const db = createServerClient();
  try {
    const result = await pushProductToPortal(db, String(body.portalId), String(body.productId), req);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Push failed." },
      { status: 400 }
    );
  }
}
