import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { orgIdForUser } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * /api/ads/markers — audio-visual sync markers (ad_markers, Z7). A
 * marker pins a moment (position seconds) on a piece of content —
 * for ads, the creative id is the content ref — where the companion
 * visual changes. Split by engine (20261169): a v2 creative ref
 * (all-digits, the ids the companion surfaces carry now) is stored
 * in creative_v2_id and ownership runs creative → campaign →
 * advertiser; a legacy uuid ref stays in content_ref with ownership
 * through ad_legacy_campaigns (org-scoped). Responses normalize the
 * ref back out as `content_ref` (the v2 id as text for v2 rows).
 */
async function ownsCreative(userId: string, ref: string) {
  if (/^\d+$/.test(ref)) {
    const rows = await pgQueryStrict<{ id: string }>(
      `SELECT cr.id FROM public.ad_creatives cr
         JOIN public.ad_campaigns c ON c.id = cr.campaign_id
         JOIN public.ad_advertisers a ON a.id = c.advertiser_id
        WHERE cr.id = $1 AND a.user_id = $2`,
      [ref, userId],
    );
    return rows.length > 0;
  }
  const organizationId = await orgIdForUser(userId);
  if (!organizationId) return false;
  const rows = await pgQueryStrict<{ id: string }>(
    `SELECT cr.id FROM public.ad_legacy_creatives cr
       JOIN public.ad_legacy_campaigns c ON c.id = cr.campaign_id
      WHERE cr.id = $1 AND c.organization_id = $2`,
    [ref, organizationId],
  );
  return rows.length > 0;
}

const MARKER_SELECT = `
  SELECT id, COALESCE(creative_v2_id::text, content_ref::text) AS content_ref,
         creative_v2_id, position, type, duration, enabled, created_at, updated_at
    FROM public.ad_markers`;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const contentRef = new URL(req.url).searchParams.get("content_ref");
  if (!contentRef) return NextResponse.json({ error: "content_ref_required" }, { status: 400 });
  try {
    if (!(await ownsCreative(user.id, contentRef)))
      return NextResponse.json({ markers: [] });
    const markers = /^\d+$/.test(contentRef)
      ? await pgQueryStrict(
          `${MARKER_SELECT} WHERE creative_v2_id = $1 ORDER BY position ASC LIMIT 200`,
          [contentRef],
        )
      : await pgQueryStrict(
          `${MARKER_SELECT} WHERE content_ref = $1 ORDER BY position ASC LIMIT 200`,
          [contentRef],
        );
    return NextResponse.json({ markers });
  } catch {
    return NextResponse.json({ error: "markers_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const contentRef = String(body.content_ref ?? "");
  const position = Number(body.position);
  if (!contentRef || !Number.isFinite(position) || position < 0)
    return NextResponse.json({ error: "content_ref_and_position_required" }, { status: 400 });
  try {
    if (!(await ownsCreative(user.id, contentRef)))
      return NextResponse.json({ error: "creative_not_found" }, { status: 404 });
    const isV2 = /^\d+$/.test(contentRef);
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_markers (content_ref, creative_v2_id, position, type, duration, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        isV2 ? null : contentRef,
        isV2 ? contentRef : null,
        position,
        body.type ? String(body.type) : "companion_swap",
        body.duration == null ? null : Number(body.duration),
        body.enabled !== false,
      ],
    );
    const full = await pgQueryStrict(`${MARKER_SELECT} WHERE id = $1`, [rows[0].id]);
    return NextResponse.json({ marker: full[0] });
  } catch {
    return NextResponse.json({ error: "marker_create_unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    const rows = await pgQueryStrict<{
      id: string;
      content_ref: string | null;
      creative_v2_id: string | null;
    }>(
      `SELECT id, content_ref, creative_v2_id::text AS creative_v2_id
         FROM public.ad_markers WHERE id = $1`,
      [id],
    );
    const marker = rows[0];
    if (!marker) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const ref = marker.creative_v2_id ?? marker.content_ref;
    if (!ref || !(await ownsCreative(user.id, ref)))
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    await pgQueryStrict(`DELETE FROM public.ad_markers WHERE id = $1`, [id]);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "marker_delete_unavailable" }, { status: 503 });
  }
}
