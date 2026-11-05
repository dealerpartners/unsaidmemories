import { NextResponse } from "next/server";
import { getPgWithRetry, pgQueryStrict } from "@/lib/pg";
import {
  authenticateLicensee,
  hasScope,
} from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the caller's creatives (filter ?campaign_id=).
export async function GET(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const campaignId = new URL(req.url).searchParams.get("campaign_id");
  const rows = await pgQueryStrict(
    `SELECT cr.id::text AS id, cr.campaign_id::text AS campaign_id,
            cr.name, cr.status, cr.asset_url, cr.image_url, cr.click_url,
            cr.link_url, cr.headline, cr.body, cr.cta,
            d.id::text AS design_id, d.product_id::text AS product_id,
            d.background, d.layout, d.status AS design_status
       FROM public.ad_creatives cr
       JOIN public.ad_campaigns c ON c.id = cr.campaign_id
       LEFT JOIN public.licensee_creative_designs d ON d.creative_id = cr.id
      WHERE c.advertiser_id = $1
        AND ($2::bigint IS NULL OR cr.campaign_id = $2::bigint)
      ORDER BY cr.created_at DESC`,
    [auth.adAdvertiserId, campaignId ?? null],
  );
  return NextResponse.json({ creatives: rows });
}

// POST — design an ad creative INSIDE the Ad Center (this API is the
// same one the Ad Center UI calls; there is no separate portal path).
// Body: { campaign_id, name?, headline?, body?, cta?, image_url?,
//   click_url?, product_id?, background?, layout? }
// When a finished product is chosen and no image/click URL is given,
// the creative takes the product's image and its /product/<id> page.
// The creative is created 'active' in the campaign's Default group, so
// it serves the moment the campaign itself is published (active +
// flight window + placement + rate). The design row records the
// Ad Center design behind the servable creative.
export async function POST(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth || !hasScope(auth, "ads:write")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const campaignId = String(body.campaign_id ?? "");
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
  }
  const productId =
    body.product_id != null ? String(body.product_id) : null;
  const client = await getPgWithRetry();
  try {
    await client.query("BEGIN");
    const camp = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM public.ad_campaigns
        WHERE id = $1 AND advertiser_id = $2 LIMIT 1`,
      [campaignId, auth.adAdvertiserId],
    );
    if (!camp.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    let product: { image_url: string | null } | null = null;
    if (productId) {
      const p = await client.query<{ image_url: string | null }>(
        `SELECT image_url FROM public.supplier_catalog_products
          WHERE id = $1 AND is_hidden = false LIMIT 1`,
        [productId],
      );
      if (!p.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "product_not_found_or_hidden" },
          { status: 400 },
        );
      }
      product = p.rows[0];
    }
    const group = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM public.ad_campaign_groups
        WHERE campaign_id = $1 AND status = 'active'
        ORDER BY id ASC LIMIT 1`,
      [campaignId],
    );
    const groupId = group.rows[0]?.id;
    if (!groupId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "campaign_has_no_group" }, { status: 500 });
    }
    const headline = body.headline != null ? String(body.headline) : null;
    const creativeBody = body.body != null ? String(body.body) : null;
    const cta = body.cta != null ? String(body.cta) : "Shop now";
    const imageUrl =
      body.image_url != null
        ? String(body.image_url)
        : (product?.image_url ?? null);
    // ad_creatives.asset_url is NOT NULL and width/height are NOT NULL
    // with CHECK (> 0): a creative without an image cannot be stored
    // in this schema, so that is a caller error, not a 503.
    if (!imageUrl) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "image_url required (or choose a product with an image)" },
        { status: 400 },
      );
    }
    const width =
      body.width != null && Number(body.width) > 0 ? Math.round(Number(body.width)) : 1200;
    const height =
      body.height != null && Number(body.height) > 0 ? Math.round(Number(body.height)) : 628;
    const clickUrl =
      body.click_url != null
        ? String(body.click_url)
        : productId
          ? `/product/${productId}`
          : null;
    const name =
      body.name != null && String(body.name).trim()
        ? String(body.name)
        : (headline ?? "Ad creative");
    const cr = await client.query<{ id: string }>(
      `INSERT INTO public.ad_creatives
         (campaign_id, group_id, name, status, asset_url, image_url,
          click_url, link_url, headline, body, cta, width, height)
       VALUES ($1, $2, $3, 'active', $4, $4, $5, $5, $6, $7, $8, $9, $10)
       RETURNING id::text AS id`,
      [campaignId, groupId, name, imageUrl, clickUrl, headline, creativeBody, cta, width, height],
    );
    const creativeId = cr.rows[0].id;
    const design = await client.query<{ id: string }>(
      `INSERT INTO public.licensee_creative_designs
         (advertiser_id, campaign_id, creative_id, product_id, headline,
          body, cta, image_url, click_url, background, layout, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published')
       RETURNING id::text AS id`,
      [
        auth.advertiserId,
        campaignId,
        creativeId,
        productId,
        headline,
        creativeBody,
        cta,
        imageUrl,
        clickUrl,
        body.background != null ? String(body.background) : "#ffffff",
        body.layout != null ? String(body.layout) : "card",
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      {
        id: creativeId,
        design_id: design.rows[0].id,
        campaign_id: campaignId,
        status: "active",
        headline,
        image_url: imageUrl,
        click_url: clickUrl,
      },
      { status: 201 },
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("licensee creative create failed", err);
    return NextResponse.json({ error: "creative_create_failed" }, { status: 503 });
  } finally {
    client.release();
  }
}
