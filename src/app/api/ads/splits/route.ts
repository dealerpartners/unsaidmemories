import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { loadOwnedCampaign } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * /api/ads/splits — split testing (Y4) on the Ads v2 experiment
 * tables: ad_experiments + ad_experiment_variants (the legacy
 * ad_campaign_splits table is dropped by the retirement script).
 * One ACTIVE experiment per campaign is the working model: POST
 * replaces its variant set, GET reads it back with per-creative
 * delivery from ad_events, DELETE removes one variant.
 *
 * Contract (unchanged for the portal): splits carry a display
 * `variant` label — v2 variant rows have no label column, so the
 * label is derived from row order (A, B, C…) and ignored on write.
 * Conversions are 0: the v2 event ledger has no conversion type.
 */

const label = (i: number) => String.fromCharCode(65 + i);

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const campaignId = new URL(req.url).searchParams.get("campaign_id");
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id_required" }, { status: 400 });
  }
  try {
    const owned = await loadOwnedCampaign(user.id, campaignId);
    if (!owned) return NextResponse.json({ splits: [] });
    const exp = await pgQueryStrict<{ id: string }>(
      `SELECT id::text AS id FROM public.ad_experiments
        WHERE campaign_id = $1 AND status = 'active'
        ORDER BY id ASC LIMIT 1`,
      [campaignId],
    );
    if (!exp[0]) return NextResponse.json({ splits: [] });
    const rows = await pgQueryStrict<{
      id: string;
      creative_id: string;
      weight: number;
      creative_headline: string | null;
      impressions: number;
      clicks: number;
    }>(
      `SELECT v.id::text AS id, v.creative_id::text AS creative_id,
              v.weight, cr.headline AS creative_headline,
              (SELECT COUNT(*)::int FROM public.ad_events e
                WHERE e.creative_id = v.creative_id
                  AND e.campaign_id = $1
                  AND e.event_type = 'impression') AS impressions,
              (SELECT COUNT(*)::int FROM public.ad_events e
                WHERE e.creative_id = v.creative_id
                  AND e.campaign_id = $1
                  AND e.event_type = 'click') AS clicks
         FROM public.ad_experiment_variants v
         JOIN public.ad_creatives cr ON cr.id = v.creative_id
        WHERE v.experiment_id = $2
        ORDER BY v.id`,
      [campaignId, exp[0].id],
    );
    return NextResponse.json({
      experiment_id: exp[0].id,
      splits: rows.map((r, i) => ({
        id: r.id,
        campaign_id: campaignId,
        variant: label(i),
        weight: Number(r.weight),
        creative_id: r.creative_id,
        creative_headline: r.creative_headline,
        impressions: Number(r.impressions),
        clicks: Number(r.clicks),
        conversions: 0,
      })),
    });
  } catch {
    return NextResponse.json({ error: "splits_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const campaignId = String(body.campaign_id ?? "");
  const variants = Array.isArray(body.variants)
    ? (body.variants as Array<Record<string, unknown>>)
    : [];
  if (!campaignId || variants.length === 0) {
    return NextResponse.json(
      { error: "campaign_and_variants_required" },
      { status: 400 },
    );
  }
  try {
    const owned = await loadOwnedCampaign(user.id, campaignId);
    if (!owned) {
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    // Every variant creative must belong to this campaign.
    const creativeIds = variants.map((v) => String(v.creative_id ?? ""));
    const valid = await pgQueryStrict<{ id: string }>(
      `SELECT cr.id::text AS id FROM public.ad_creatives cr
         JOIN public.ad_campaign_groups g ON g.id = cr.group_id
        WHERE g.campaign_id = $1 AND cr.id = ANY($2::bigint[])`,
      [campaignId, creativeIds],
    );
    if (valid.length !== new Set(creativeIds).size) {
      return NextResponse.json(
        { error: "variant_creative_not_in_campaign" },
        { status: 400 },
      );
    }
    // Serve reads the EARLIEST active experiment (serve-core picks
    // ORDER BY id ASC), so the working model is exactly one: reuse
    // it if present, create it if not.
    const existing = await pgQueryStrict<{ id: string }>(
      `SELECT id::text AS id FROM public.ad_experiments
        WHERE campaign_id = $1 AND status = 'active'
        ORDER BY id ASC LIMIT 1`,
      [campaignId],
    );
    let experimentId = existing[0]?.id;
    if (!experimentId) {
      const created = await pgQueryStrict<{ id: string }>(
        `INSERT INTO public.ad_experiments (campaign_id, name, status)
         VALUES ($1, 'Split test', 'active')
         RETURNING id::text AS id`,
        [campaignId],
      );
      experimentId = created[0]?.id;
    }
    if (!experimentId) {
      return NextResponse.json({ error: "experiment_unavailable" }, { status: 503 });
    }
    await pgQueryStrict(
      `DELETE FROM public.ad_experiment_variants WHERE experiment_id = $1`,
      [experimentId],
    );
    let saved = 0;
    for (const v of variants) {
      const weight = Math.max(1, Math.floor(Number(v.weight) || 0));
      await pgQueryStrict(
        `INSERT INTO public.ad_experiment_variants
           (experiment_id, creative_id, weight)
         VALUES ($1, $2, $3)`,
        [experimentId, String(v.creative_id), weight],
      );
      saved += 1;
    }
    return NextResponse.json({ experiment_id: experimentId, saved });
  } catch {
    return NextResponse.json({ error: "split_save_unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    const rows = await pgQueryStrict<{ campaign_id: string }>(
      `SELECT e.campaign_id::text AS campaign_id
         FROM public.ad_experiment_variants v
         JOIN public.ad_experiments e ON e.id = v.experiment_id
        WHERE v.id = $1`,
      [id],
    );
    if (!rows[0]) return NextResponse.json({ deleted: false });
    const owned = await loadOwnedCampaign(user.id, rows[0].campaign_id);
    if (!owned) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await pgQueryStrict(
      `DELETE FROM public.ad_experiment_variants WHERE id = $1`,
      [id],
    );
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "split_delete_unavailable" }, { status: 503 });
  }
}
