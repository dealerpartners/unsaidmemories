import { NextResponse } from "next/server";
import { serveAds, type AdDevice } from "@/lib/ads/serve-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Licensee serve endpoint — the SAME deterministic decision core as
// /api/ads/serve (src/lib/ads/serve-core.ts), not a second decision
// path: placement -> tier order -> flight window -> budget, no
// auction. Public like the storefront serve route: shop-page slots
// call it from the browser with no advertiser key.
function inputFrom(search: URLSearchParams, body: Record<string, unknown>) {
  const pick = (k: string) =>
    body[k] != null ? String(body[k]) : search.get(k);
  const device = (pick("device") ?? "desktop") as AdDevice;
  return {
    placement: pick("placement") ?? "",
    category_id: pick("category_id"),
    page_id: pick("page_id") != null ? Number(pick("page_id")) : null,
    device: ["desktop", "tablet", "mobile"].includes(device)
      ? device
      : "desktop",
    language: pick("language"),
    state: pick("state"),
    ad_uid: pick("ad_uid"),
    request_id: pick("request_id"),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const result = await serveAds(inputFrom(url.searchParams, {}));
    return NextResponse.json(result);
  } catch (err) {
    console.error("licensee serve failed", err);
    return NextResponse.json(
      { request_id: null, placement: url.searchParams.get("placement"), ads: [] },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  try {
    const result = await serveAds(
      inputFrom(new URL(req.url).searchParams, body),
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("licensee serve failed", err);
    return NextResponse.json(
      { request_id: null, placement: String(body.placement ?? ""), ads: [] },
      { status: 503 },
    );
  }
}
