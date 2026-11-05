import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import {
  authenticateLicensee,
  hasScope,
} from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH — edit one of the caller's creatives (and its design row).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateLicensee(req);
  if (!auth || !hasScope(auth, "ads:write")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const owned = await pgQueryStrict<{ id: string }>(
    `SELECT cr.id::text AS id FROM public.ad_creatives cr
       JOIN public.ad_campaigns c ON c.id = cr.campaign_id
      WHERE cr.id = $1 AND c.advertiser_id = $2 LIMIT 1`,
    [id, auth.adAdvertiserId],
  );
  if (!owned[0]) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const map: Record<string, string> = {
    name: "name",
    headline: "headline",
    body: "body",
    cta: "cta",
    image_url: "image_url",
    click_url: "click_url",
    status: "status",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(map)) {
    if (body[key] != null) {
      vals.push(String(body[key]));
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (body.status != null && !["active", "paused", "archived"].includes(String(body.status))) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  if (sets.length) {
    vals.push(id);
    await pgQueryStrict(
      `UPDATE public.ad_creatives SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${vals.length}`,
      vals,
    );
  }
  return NextResponse.json({ ok: true });
}
