import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getSession } from "@/lib/auth/server";
import { VIEWER_COOKIE, viewerContextFromRequest } from "@/lib/ads-server";
import {
  serveAds,
  type AdDevice,
  type ServeInput,
} from "@/lib/ads/serve-core";

export const dynamic = "force-dynamic";

/**
 * /api/ads/serve — the Ads v2 delivery endpoint (spec sections 16, 24).
 *
 * POST is the contract: { placement, category_id, page_id, device,
 * language, state, ad_uid, request_id } -> { request_id, placement,
 * ads: [{ campaign_id, creative_id, asset_url, click_url,
 * tracking_id, ... }] }. Selection is the deterministic tier fill +
 * least-delivered rotation with an atomic budget reservation, all in
 * src/lib/ads/serve-core.ts. There is no auction and no random().
 *
 * GET is a thin adapter over the same core for the mounted AdSlot
 * components (placement/state/category as query params; category may
 * be a taxonomy node uuid or a taxonomy slug). The anonymous ad
 * identity rides the aapw_avid cookie the old system established;
 * when serve issues a new one it is set on the response.
 */

function readAdUid(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${VIEWER_COOKIE}=([^;]+)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function isLoggedIn(): Promise<boolean> {
  try {
    const session = await getSession();
    return !!session?.user?.id;
  } catch {
    return false;
  }
}

function respond(
  body: unknown,
  status: number,
  issuedAdUid: string | null,
) {
  const res = NextResponse.json(body, { status });
  if (issuedAdUid) {
    res.cookies.set(VIEWER_COOKIE, issuedAdUid, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

async function runServe(input: ServeInput, fallbackPlacement: string) {
  try {
    const result = await serveAds(input);
    return respond(
      {
        request_id: result.request_id,
        placement: result.placement,
        ads: result.ads,
        ...(result.issued_ad_uid ? { ad_uid: result.issued_ad_uid } : {}),
      },
      200,
      result.issued_ad_uid,
    );
  } catch (err) {
    // Serving must degrade to an empty slot, never a broken page — but
    // the failure itself is logged: a silent catch made a transient
    // database-saturation wave indistinguishable from a code defect
    // during the 2026-10-24 journey walk.
    console.error("ads serve failed", err);
    return respond(
      { request_id: input.request_id ?? null, placement: fallbackPlacement, ads: [] },
      503,
      null,
    );
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const viewer = viewerContextFromRequest(req);

  let placement = String(body.placement ?? "").trim();
  if (!placement && body.placement_id != null) {
    const rows = await pgQueryStrict<{ code: string }>(
      `SELECT code FROM public.ad_placements WHERE id = $1 LIMIT 1`,
      [Number(body.placement_id)],
    ).catch(() => [] as { code: string }[]);
    placement = rows[0]?.code ?? "";
  }

  const deviceRaw = String(body.device ?? "").toLowerCase();
  const device: AdDevice =
    deviceRaw === "mobile" || deviceRaw === "tablet" || deviceRaw === "desktop"
      ? (deviceRaw as AdDevice)
      : viewer.device;

  return runServe(
    {
      placement,
      category_id:
        body.category_id != null ? String(body.category_id) : null,
      page_id: body.page_id != null ? Number(body.page_id) : null,
      device,
      language:
        body.language != null ? String(body.language) : viewer.language,
      state: body.state != null ? String(body.state) : viewer.state,
      ad_uid:
        body.ad_uid != null ? String(body.ad_uid) : readAdUid(req),
      logged_in: await isLoggedIn(),
      request_id:
        body.request_id != null ? String(body.request_id) : null,
    },
    placement,
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const viewer = viewerContextFromRequest(req);
  const placement = url.searchParams.get("placement")?.trim() || "shop";

  // Category context: a taxonomy node uuid directly, or a slug the
  // shop surfaces know (resolved against taxonomy_nodes).
  let categoryId: string | null =
    url.searchParams.get("category_id") ?? url.searchParams.get("category");
  if (categoryId && !/^[0-9a-f-]{36}$/i.test(categoryId)) {
    const rows = await pgQueryStrict<{ id: string }>(
      `SELECT id::text AS id FROM public.taxonomy_nodes
        WHERE slug = $1 ORDER BY depth DESC LIMIT 1`,
      [categoryId],
    ).catch(() => [] as { id: string }[]);
    categoryId = rows[0]?.id ?? null;
  }

  return runServe(
    {
      placement,
      category_id: categoryId,
      page_id: url.searchParams.get("page_id")
        ? Number(url.searchParams.get("page_id"))
        : null,
      device: viewer.device,
      language: viewer.language,
      state: url.searchParams.get("state") ?? viewer.state,
      ad_uid: readAdUid(req),
      logged_in: await isLoggedIn(),
    },
    placement,
  );
}
