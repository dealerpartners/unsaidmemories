import { NextRequest } from "next/server";
import { isProxiedImageHost } from "@/lib/image-proxy";

/**
 * Same-origin proxy for supplier CDN images that send no CORS headers
 * (see src/lib/image-proxy.ts). The host allowlist is the SSRF guard:
 * this route fetches ONLY the censused supplier CDN hosts, only over
 * http/https, and only returns image content types.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw || raw.length > 4096) {
    return new Response("missing url", { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new Response("bad protocol", { status: 400 });
  }
  if (!isProxiedImageHost(target.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "Unsaid image proxy" },
      redirect: "follow",
    });
  } catch {
    return new Response("upstream fetch failed", { status: 502 });
  }
  if (!upstream.ok) {
    return new Response("upstream error", { status: 502 });
  }
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return new Response("not an image", { status: 415 });
  }
  const length = Number(upstream.headers.get("content-length") ?? "0");
  if (length > 25 * 1024 * 1024) {
    return new Response("image too large", { status: 413 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
