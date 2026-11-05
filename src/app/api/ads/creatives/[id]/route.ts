import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * /api/ads/creatives/[id] — single-creative writes (Z6/Z7) on the
 * Ads v2 tables. Ownership runs creative → group → campaign →
 * advertiser. PATCH covers the creative's own fields plus the Z7
 * companion assets (companion_image / audio_url are
 * ad_creative_assets rows; av_sync rides the companion asset's
 * meta). Status moves an owner may make never bypass review: a
 * creative reaches 'active' only from 'paused' (it was approved
 * before) — 'pending_review' is entered from 'rejected' (resubmit)
 * or by editing a live creative's content, and approval itself is
 * the admin console's act. DELETE removes the creative; experiment
 * variants referencing it cascade (ad_experiment_variants FK), and
 * ad_events history stays, keyed by creative id.
 */

async function loadOwnedCreative(userId: string, id: string) {
  const rows = await pgQueryStrict<{ id: string; status: string }>(
    `SELECT cr.id::text AS id, cr.status
       FROM public.ad_creatives cr
       JOIN public.ad_campaign_groups g ON g.id = cr.group_id
       JOIN public.ad_campaigns c ON c.id = g.campaign_id
       JOIN public.ad_advertisers a ON a.id = c.advertiser_id
      WHERE cr.id = $1 AND a.user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

const OWNER_STATUS: Record<string, string[]> = {
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  pending_review: ["archived"],
  rejected: ["pending_review", "archived"],
  archived: [],
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const creative = await loadOwnedCreative(user.id, id);
    if (!creative) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (col: string, v: unknown) => {
      values.push(v);
      sets.push(`${col} = $${values.length}`);
    };
    const str = (v: unknown) => (v === null ? null : String(v));
    if (body.name !== undefined) set("name", str(body.name));
    if (body.headline !== undefined) set("headline", str(body.headline));
    if (body.body !== undefined) set("body", str(body.body));
    if (body.cta !== undefined) set("cta", str(body.cta));
    if (body.image_url !== undefined || body.asset_url !== undefined) {
      set("asset_url", str(body.image_url ?? body.asset_url));
    }
    if (body.link_url !== undefined || body.click_url !== undefined) {
      set("click_url", str(body.link_url ?? body.click_url) ?? "/shop");
    }
    // width/height are NOT NULL (> 0): a null or non-positive value
    // means "leave the declared size alone", never a NULL write.
    if (body.width !== undefined && Math.floor(Number(body.width)) > 0) {
      set("width", Math.floor(Number(body.width)));
    }
    if (body.height !== undefined && Math.floor(Number(body.height)) > 0) {
      set("height", Math.floor(Number(body.height)));
    }
    // Substantive content edits to an approved creative re-enter
    // review (the approval covered the old content). Pause/archive
    // and asset-only companion edits do not.
    const contentEdited =
      body.headline !== undefined ||
      body.body !== undefined ||
      body.image_url !== undefined ||
      body.asset_url !== undefined ||
      body.link_url !== undefined ||
      body.click_url !== undefined;
    if (body.status !== undefined) {
      const to = String(body.status);
      const allowed = OWNER_STATUS[creative.status] ?? [];
      if (!allowed.includes(to)) {
        return NextResponse.json(
          { error: "invalid_status_transition", from: creative.status, to },
          { status: 409 },
        );
      }
      set("status", to);
    } else if (contentEdited && creative.status === "active") {
      set("status", "pending_review");
    }
    if (sets.length) {
      values.push(id);
      await pgQueryStrict(
        `UPDATE public.ad_creatives SET ${sets.join(", ")}, updated_at = now()
          WHERE id = $${values.length}`,
        values,
      );
    }

    // Z7 companion assets: companion_image / audio_url replace the
    // creative's asset row of that kind; av_sync rides the companion
    // asset's meta (created alongside when an image is supplied).
    const assetWrites: Array<[string, unknown]> = [
      ["companion_image", body.companion_image],
      ["audio", body.audio_url],
      ["video", body.video_url],
    ];
    for (const [kind, url] of assetWrites) {
      if (url === undefined) continue;
      await pgQueryStrict(
        `DELETE FROM public.ad_creative_assets
          WHERE creative_id = $1 AND kind = $2`,
        [id, kind],
      );
      if (url !== null && String(url)) {
        await pgQueryStrict(
          `INSERT INTO public.ad_creative_assets (creative_id, kind, asset_url, meta)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [
            id,
            kind,
            String(url),
            kind === "companion_image"
              ? JSON.stringify({ av_sync: body.av_sync === true })
              : "{}",
          ],
        );
      }
    }
    if (body.av_sync !== undefined && body.companion_image === undefined) {
      await pgQueryStrict(
        `UPDATE public.ad_creative_assets
            SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{av_sync}', $3::jsonb)
          WHERE creative_id = $1 AND kind = 'companion_image'`,
        [id, null, JSON.stringify(body.av_sync === true)],
      ).catch(() => undefined);
    }

    const rows = await pgQueryStrict(
      `SELECT cr.id::text AS id, cr.group_id::text AS group_id,
              cr.name, cr.status, cr.asset_url, cr.click_url,
              cr.asset_url AS image_url, cr.click_url AS link_url,
              cr.headline, cr.body, cr.cta, cr.width, cr.height,
              cr.created_at, cr.updated_at,
              (SELECT a.asset_url FROM public.ad_creative_assets a
                WHERE a.creative_id = cr.id AND a.kind = 'companion_image'
                ORDER BY a.id LIMIT 1) AS companion_image,
              (SELECT a.asset_url FROM public.ad_creative_assets a
                WHERE a.creative_id = cr.id AND a.kind = 'audio'
                ORDER BY a.id LIMIT 1) AS audio_url,
              (SELECT COALESCE((a.meta->>'av_sync')::boolean, false)
                 FROM public.ad_creative_assets a
                WHERE a.creative_id = cr.id AND a.kind = 'companion_image'
                ORDER BY a.id LIMIT 1) AS av_sync
         FROM public.ad_creatives cr WHERE cr.id = $1`,
      [id],
    );
    return NextResponse.json({ creative: rows[0] });
  } catch {
    return NextResponse.json({ error: "creative_update_unavailable" }, { status: 503 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const creative = await loadOwnedCreative(user.id, id);
    if (!creative) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await pgQueryStrict(`DELETE FROM public.ad_creatives WHERE id = $1`, [id]);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "creative_delete_unavailable" }, { status: 503 });
  }
}
