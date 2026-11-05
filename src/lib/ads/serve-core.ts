import "server-only";
import { getPgWithRetry, pgQueryStrict } from "@/lib/pg";

// ============================================================================
// serve-core.ts — the Ads v2 serving contract (Sunny's Production Ad
// Architecture, 2026-10-23). Direct-sold, rate-card, deterministic.
//
//   request -> ELIGIBILITY (advertiser active, campaign active, flight
//   window, placement, category incl. descendants via the taxonomy's
//   own hierarchy, targeting row, frequency vs tier cap, daily +
//   lifetime budget vs counters)
//   -> TIER FILL (Platinum -> Gold -> Silver -> House, up to the
//   placement's max_per_page, respecting each tier's max_ads_per_page)
//   -> ROTATION (ORDER BY tier priority, delivered_today ASC,
//   deterministic md5 tie-break seeded by the request id)
//   -> ATOMIC RESERVATION (candidate campaign rows are locked
//   FOR UPDATE SKIP LOCKED; ad_campaign_daily + ad_frequency +
//   lifetime spend are incremented inside the same transaction,
//   so two simultaneous requests can never overspend a campaign)
//   -> EVENT LEDGER (one ad_events 'impression' row per served ad).
//
// There is deliberately NO auction, bid, pacing, or optimization of
// any kind: a campaign's price was snapshotted per placement at
// launch (ad_campaign_rates) and money enters selection only as a
// budget cap. No eligible paid campaigns -> House fills. House
// exhausted -> an empty ads array (never an error).
//
// Spend math (adaptation A5): CPM is cents per 1000 impressions, so
// one impression costs exactly cpm_cents MILLI-cents. Counters
// accumulate milli-cents exactly; the integer spend_cents columns
// are generated floors. Budget checks compare milli-cents against
// cap_cents * 1000 — no impression is ever free or double-charged
// by rounding.
//
// Frequency identity (adaptation A7): ad_uid only — the anonymous
// aapw_avid identifier. The system never keys frequency on a person.
// ============================================================================

export type AdDevice = "desktop" | "tablet" | "mobile";

export interface ServeInput {
  placement: string; // placement CODE (ad_placements.code)
  category_id?: string | null; // taxonomy_nodes.id (uuid) of the page's node
  page_id?: number | null;
  device?: AdDevice;
  language?: string | null; // ISO primary tag, e.g. "en"
  state?: string | null; // US state code, e.g. "TN"
  ad_uid?: string | null; // anonymous ad identity (aapw_avid)
  logged_in?: boolean;
  request_id?: string | null;
}

export interface ServedAd {
  campaign_id: string;
  creative_id: string;
  tier: string;
  asset_url: string;
  /** The creative's own destination (ad_creatives.click_url). */
  destination_url: string;
  /** The tracked click endpoint the frontend links to. */
  click_url: string;
  tracking_id: string;
  headline: string | null;
  body: string | null;
  cta: string | null;
  /** AdSlot-compatible alias of asset_url. */
  image_url: string | null;
}

export interface ServeResult {
  request_id: string;
  placement: string;
  ads: ServedAd[];
  /** Set when the request carried no ad_uid and one was issued. */
  issued_ad_uid: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEVICE_BIT: Record<AdDevice, number> = {
  desktop: 1,
  tablet: 2,
  mobile: 4,
};

function asInt(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Deterministic 32-bit string hash (variant assignment, tie-breaks). */
export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

interface Candidate {
  campaign_id: string;
  tier_code: string;
  max_ads_per_page: number;
  frequency_cap_daily: number;
  daily_budget_cents: number;
  lifetime_budget_cents: number;
  lifetime_spend_millicents: number;
  cpm_cents: number;
  delivered_today: number;
  spent_today_millicents: number;
  viewer_today: number;
}

interface CreativeRow {
  id: string;
  asset_url: string;
  click_url: string;
  headline: string | null;
  body: string | null;
  cta: string | null;
}

type TxClient = Awaited<ReturnType<typeof getPgWithRetry>>;

/** The request node's ancestor chain (itself first), via taxonomy_nodes. */
async function categoryAncestors(
  client: TxClient,
  categoryId: string,
): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `WITH RECURSIVE anc AS (
       SELECT id, parent_id, 0 AS lvl
         FROM public.taxonomy_nodes WHERE id = $1::uuid
       UNION ALL
       SELECT n.id, n.parent_id, anc.lvl + 1
         FROM public.taxonomy_nodes n
         JOIN anc ON n.id = anc.parent_id
        WHERE anc.lvl < 64
     )
     SELECT id FROM anc`,
    [categoryId],
  );
  return rows.map((r) => r.id);
}

/**
 * Choose the creative for a selected campaign, inside the serve
 * transaction. An active experiment (Y4) assigns ONE variant creative
 * deterministically (hash of the ad identity + experiment over the
 * variant weights); otherwise creatives rotate least-delivered-first
 * (today's impressions from ad_events), hash tie-break per request.
 * Only active creatives in active groups serve (Campaign -> Groups ->
 * Creatives). Returns null when the campaign has nothing servable.
 */
async function pickCreative(
  client: TxClient,
  campaignId: string,
  seedKey: string,
): Promise<CreativeRow | null> {
  const exp = await client.query<{ id: string }>(
    `SELECT id FROM public.ad_experiments
      WHERE campaign_id = $1 AND status = 'active'
      ORDER BY id ASC LIMIT 1`,
    [campaignId],
  );
  if (exp.rows[0]) {
    const variants = await client.query<CreativeRow & { weight: number }>(
      `SELECT cr.id, cr.asset_url, cr.click_url, cr.headline, cr.body, cr.cta,
              v.weight
         FROM public.ad_experiment_variants v
         JOIN public.ad_creatives cr ON cr.id = v.creative_id
         JOIN public.ad_campaign_groups g
           ON g.id = cr.group_id AND g.status = 'active'
        WHERE v.experiment_id = $1 AND cr.status = 'active'
        ORDER BY v.id ASC`,
      [exp.rows[0].id],
    );
    const total = variants.rows.reduce((a, v) => a + asInt(v.weight), 0);
    if (total > 0) {
      let pick = hashSeed(`${seedKey}:${exp.rows[0].id}`) % total;
      for (const v of variants.rows) {
        pick -= asInt(v.weight);
        if (pick < 0) return v;
      }
      return variants.rows[variants.rows.length - 1];
    }
  }
  const { rows } = await client.query<CreativeRow>(
    `SELECT cr.id, cr.asset_url, cr.click_url, cr.headline, cr.body, cr.cta
       FROM public.ad_creatives cr
       JOIN public.ad_campaign_groups g
         ON g.id = cr.group_id AND g.status = 'active'
      WHERE cr.campaign_id = $1 AND cr.status = 'active'
      ORDER BY
        (SELECT count(*) FROM public.ad_events ev
          WHERE ev.creative_id = cr.id AND ev.event_type = 'impression'
            AND ev.event_time >= CURRENT_DATE) ASC,
        md5($2 || ':' || cr.id::text) ASC,
        cr.id ASC
      LIMIT 1`,
    [campaignId, seedKey],
  );
  return rows[0] ?? null;
}

export async function serveAds(input: ServeInput): Promise<ServeResult> {
  const requestId =
    input.request_id && UUID_RE.test(input.request_id)
      ? input.request_id
      : crypto.randomUUID();
  const placementCode = (input.placement ?? "").trim();
  const issuedAdUid =
    input.ad_uid && UUID_RE.test(input.ad_uid) ? null : crypto.randomUUID();
  const adUid = issuedAdUid ?? (input.ad_uid as string);
  const categoryId =
    input.category_id && UUID_RE.test(input.category_id)
      ? input.category_id
      : null;
  const device: AdDevice = input.device ?? "desktop";
  const language = (input.language ?? "en").split("-")[0].toLowerCase();
  const state = input.state
    ? input.state.trim().toUpperCase().slice(0, 2)
    : null;
  const loggedIn = input.logged_in === true;

  const client = await getPgWithRetry();
  try {
    await client.query("BEGIN");

    const pl = await client.query<{ id: number; max_per_page: number }>(
      `SELECT id, max_per_page FROM public.ad_placements
        WHERE code = $1 AND active = true LIMIT 1`,
      [placementCode],
    );
    const placement = pl.rows[0];
    if (!placement) {
      await client.query("COMMIT");
      return {
        request_id: requestId,
        placement: placementCode,
        ads: [],
        issued_ad_uid: issuedAdUid,
      };
    }

    const ancestors = categoryId
      ? await categoryAncestors(client, categoryId)
      : [];

    // Candidate campaigns in rotation order, campaign rows locked so
    // this transaction is the only one reserving against them
    // (spec section 17). SKIP LOCKED: a campaign another request is
    // mid-reservation on is simply not a candidate for this request.
    const cand = await client.query<Record<string, unknown>>(
      `SELECT c.id::text AS campaign_id,
              t.code AS tier_code,
              t.max_ads_per_page,
              t.frequency_cap_daily,
              c.daily_budget_cents::text AS daily_budget_cents,
              c.lifetime_budget_cents::text AS lifetime_budget_cents,
              c.lifetime_spend_millicents::text AS lifetime_spend_millicents,
              r.cpm_cents,
              COALESCE(d.impressions, 0)::text AS delivered_today,
              COALESCE(d.spend_millicents, 0)::text AS spent_today_millicents,
              COALESCE(f.impressions, 0)::text AS viewer_today
         FROM public.ad_campaigns c
         JOIN public.ad_advertisers a
           ON a.id = c.advertiser_id AND a.status = 'active'
         JOIN public.ad_tiers t
           ON t.id = c.tier_id AND t.active = true
         JOIN public.ad_campaign_placements cp
           ON cp.campaign_id = c.id AND cp.placement_id = $2
         JOIN public.ad_campaign_rates r
           ON r.campaign_id = c.id AND r.placement_id = $2
         LEFT JOIN public.ad_campaign_daily d
           ON d.campaign_id = c.id AND d.delivery_date = CURRENT_DATE
         LEFT JOIN public.ad_frequency f
           ON f.campaign_id = c.id AND f.ad_uid = $7::uuid
          AND f.frequency_date = CURRENT_DATE
        WHERE c.status = 'active'
          AND now() >= c.starts_at AND now() < c.ends_at
          AND (
            NOT EXISTS (SELECT 1 FROM public.ad_campaign_categories cc
                         WHERE cc.campaign_id = c.id)
            OR ($3::uuid IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.ad_campaign_categories cc
                   WHERE cc.campaign_id = c.id
                     AND (cc.category_id = $3::uuid
                          OR (c.category_match_mode = 'descendants'
                              AND cc.category_id = ANY($4::uuid[])))))
          )
          AND (
            NOT EXISTS (SELECT 1 FROM public.ad_campaign_targeting tg
                         WHERE tg.campaign_id = c.id)
            OR EXISTS (SELECT 1 FROM public.ad_campaign_targeting tg
                        WHERE tg.campaign_id = c.id
                          AND (tg.device_mask & $5) <> 0
                          AND (tg.language_codes IS NULL
                               OR cardinality(tg.language_codes) = 0
                               OR $6 = ANY(tg.language_codes))
                          AND (tg.state_codes IS NULL
                               OR cardinality(tg.state_codes) = 0
                               OR ($8::char(2) IS NOT NULL
                                   AND $8::char(2) = ANY(tg.state_codes)))
                          AND (CASE WHEN $9 THEN tg.include_logged_in
                                    ELSE tg.include_anonymous END))
          )
        ORDER BY t.priority ASC,
                 COALESCE(d.impressions, 0) ASC,
                 md5($1 || ':' || c.id::text) ASC,
                 c.id ASC
        FOR UPDATE OF c SKIP LOCKED
        LIMIT 60`,
      [
        requestId,
        placement.id,
        categoryId,
        ancestors,
        DEVICE_BIT[device],
        language,
        adUid,
        state,
        loggedIn,
      ],
    );

    const candidates: Candidate[] = cand.rows.map((r) => ({
      campaign_id: String(r.campaign_id),
      tier_code: String(r.tier_code),
      max_ads_per_page: asInt(r.max_ads_per_page),
      frequency_cap_daily: asInt(r.frequency_cap_daily),
      daily_budget_cents: asInt(r.daily_budget_cents),
      lifetime_budget_cents: asInt(r.lifetime_budget_cents),
      lifetime_spend_millicents: asInt(r.lifetime_spend_millicents),
      cpm_cents: asInt(r.cpm_cents),
      delivered_today: asInt(r.delivered_today),
      spent_today_millicents: asInt(r.spent_today_millicents),
      viewer_today: asInt(r.viewer_today),
    }));

    const ads: ServedAd[] = [];
    const tierCounts = new Map<string, number>();

    for (const c of candidates) {
      if (ads.length >= placement.max_per_page) break;
      if ((tierCounts.get(c.tier_code) ?? 0) >= c.max_ads_per_page) continue;
      // Frequency: this viewer has seen this campaign enough today.
      if (c.viewer_today >= c.frequency_cap_daily) continue;
      // Budgets, compared in milli-cents (cap 0 = unlimited).
      const perImpressionMs = c.cpm_cents; // milli-cents per impression
      if (
        c.daily_budget_cents > 0 &&
        c.spent_today_millicents + perImpressionMs > c.daily_budget_cents * 1000
      ) {
        continue;
      }
      if (
        c.lifetime_budget_cents > 0 &&
        c.lifetime_spend_millicents + perImpressionMs >
          c.lifetime_budget_cents * 1000
      ) {
        continue;
      }

      const creative = await pickCreative(
        client,
        c.campaign_id,
        `${requestId}:${adUid}`,
      );
      if (!creative) continue;

      // Atomic reservation: counters move BEFORE the response exists,
      // inside the transaction that holds the campaign lock.
      await client.query(
        `INSERT INTO public.ad_campaign_daily
           (campaign_id, delivery_date, impressions, spend_millicents)
         VALUES ($1, CURRENT_DATE, 1, $2)
         ON CONFLICT (campaign_id, delivery_date) DO UPDATE
           SET impressions = public.ad_campaign_daily.impressions + 1,
               spend_millicents =
                 public.ad_campaign_daily.spend_millicents + EXCLUDED.spend_millicents`,
        [c.campaign_id, perImpressionMs],
      );
      if (perImpressionMs > 0) {
        await client.query(
          `UPDATE public.ad_campaigns
              SET lifetime_spend_millicents =
                    lifetime_spend_millicents + $2,
                  updated_at = now()
            WHERE id = $1`,
          [c.campaign_id, perImpressionMs],
        );
      }
      await client.query(
        `INSERT INTO public.ad_frequency
           (ad_uid, campaign_id, frequency_date, impressions)
         VALUES ($1::uuid, $2, CURRENT_DATE, 1)
         ON CONFLICT (ad_uid, campaign_id, frequency_date) DO UPDATE
           SET impressions = public.ad_frequency.impressions + 1`,
        [adUid, c.campaign_id],
      );

      const trackingId = crypto.randomUUID();
      await client.query(
        `INSERT INTO public.ad_events
           (event_type, request_id, tracking_id, campaign_id, creative_id,
            placement_id, page_id, category_id, ad_uid, device_type,
            language_code, state_code, cpm_cents)
         VALUES ('impression', $1::uuid, $2::uuid, $3, $4, $5, $6,
                 $7::uuid, $8::uuid, $9, $10, $11::char(2), $12)`,
        [
          requestId,
          trackingId,
          c.campaign_id,
          creative.id,
          placement.id,
          input.page_id ?? null,
          categoryId,
          adUid,
          device,
          language,
          state,
          c.cpm_cents,
        ],
      );

      ads.push({
        campaign_id: c.campaign_id,
        creative_id: creative.id,
        tier: c.tier_code,
        asset_url: creative.asset_url,
        destination_url: creative.click_url,
        click_url: `/api/ads/click/${creative.id}?tid=${trackingId}`,
        tracking_id: trackingId,
        headline: creative.headline,
        body: creative.body,
        cta: creative.cta,
        image_url: creative.asset_url,
      });
      tierCounts.set(c.tier_code, (tierCounts.get(c.tier_code) ?? 0) + 1);
    }

    await client.query("COMMIT");
    return {
      request_id: requestId,
      placement: placementCode,
      ads,
      issued_ad_uid: issuedAdUid,
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Event recording for POST /api/ads/events and the click route. Clicks
// also bump the campaign's daily click counter. Non-transactional by
// design (a beacon must never fail a redirect), but validated: the
// creative must exist and belong to the named campaign.
// ---------------------------------------------------------------------------

export interface AdEventInput {
  event_type: "click" | "impression";
  tracking_id?: string | null;
  campaign_id: string;
  creative_id: string;
  placement?: string | null; // placement CODE
  ad_uid?: string | null;
  page_id?: number | null;
  category_id?: string | null;
}

export async function recordAdEvent(input: AdEventInput): Promise<boolean> {
  const campaignId = String(input.campaign_id ?? "");
  const creativeId = String(input.creative_id ?? "");
  if (!/^\d+$/.test(campaignId) || !/^\d+$/.test(creativeId)) return false;

  const creative = await pgQueryStrict<{ campaign_id: string }>(
    `SELECT campaign_id::text AS campaign_id FROM public.ad_creatives
      WHERE id = $1 LIMIT 1`,
    [creativeId],
  );
  if (!creative[0] || creative[0].campaign_id !== campaignId) return false;

  let placementId: number | null = null;
  if (input.placement) {
    const pl = await pgQueryStrict<{ id: number }>(
      `SELECT id FROM public.ad_placements WHERE code = $1 LIMIT 1`,
      [input.placement],
    );
    placementId = pl[0]?.id ?? null;
  }
  // A click carries no placement of its own — it belongs to the
  // placement that served the impression it clicks. Before this fix
  // the click route passed no placement, so every click landed with
  // placement_id NULL and dropped out of the analytics byPlacement
  // join (proven in the 2026-10-24 serve-driven walk: totals clicks 1,
  // byPlacement clicks 0). Resolve from the impression sharing this
  // tracking id instead of leaving the click unattributed.
  if (!placementId && input.tracking_id && UUID_RE.test(input.tracking_id)) {
    const imp = await pgQueryStrict<{ placement_id: number | null }>(
      `SELECT placement_id FROM public.ad_events
        WHERE tracking_id = $1::uuid AND event_type = 'impression'
        ORDER BY event_time DESC LIMIT 1`,
      [input.tracking_id],
    );
    placementId = imp[0]?.placement_id ?? null;
  }

  await pgQueryStrict(
    `INSERT INTO public.ad_events
       (event_type, request_id, tracking_id, campaign_id, creative_id,
        placement_id, page_id, category_id, ad_uid)
     VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid, $9::uuid)`,
    [
      input.event_type,
      crypto.randomUUID(),
      input.tracking_id && UUID_RE.test(input.tracking_id)
        ? input.tracking_id
        : null,
      campaignId,
      creativeId,
      placementId,
      input.page_id ?? null,
      input.category_id && UUID_RE.test(input.category_id)
        ? input.category_id
        : null,
      input.ad_uid && UUID_RE.test(input.ad_uid) ? input.ad_uid : null,
    ],
  );

  if (input.event_type === "click") {
    await pgQueryStrict(
      `INSERT INTO public.ad_campaign_daily
         (campaign_id, delivery_date, impressions, clicks, spend_millicents)
       VALUES ($1, CURRENT_DATE, 0, 1, 0)
       ON CONFLICT (campaign_id, delivery_date) DO UPDATE
         SET clicks = public.ad_campaign_daily.clicks + 1`,
      [campaignId],
    );
  }
  return true;
}

/** The click route's lookup: a creative's destination + its campaign. */
export async function creativeDestination(
  creativeId: string,
): Promise<{ campaign_id: string; click_url: string } | null> {
  if (!/^\d+$/.test(creativeId)) return null;
  const rows = await pgQueryStrict<{ campaign_id: string; click_url: string }>(
    `SELECT campaign_id::text AS campaign_id, click_url
       FROM public.ad_creatives WHERE id = $1 LIMIT 1`,
    [creativeId],
  );
  return rows[0] ?? null;
}
