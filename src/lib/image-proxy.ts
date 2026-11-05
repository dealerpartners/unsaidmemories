/**
 * Same-origin image proxy for canvas-bound images.
 *
 * Why this exists (studio forensic, 2026-11-01): the design studio and
 * the storefront customizer load supplier product photos into Konva
 * canvases with crossOrigin="anonymous". files.cdn.printful.com (and
 * some other supplier CDNs) return NO Access-Control-Allow-Origin
 * header, so the browser refuses the image outright — the photo never
 * enters the canvas. Dropping crossOrigin is not an option: the canvas
 * would be tainted and every print export would throw.
 *
 * The fix: route those hosts' images through our own origin
 * (/api/image-proxy), where crossOrigin="anonymous" succeeds and the
 * canvas stays clean. Only the supplier CDN hosts censused from the
 * catalog (supplier_catalog_products.image_url, 2026-11-01) are
 * proxied; every other source — data:, blob:, relative paths, our own
 * storage — passes through untouched.
 */

export const PROXIED_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  "files.cdn.printful.com",
  "images.printify.com",
  "appassets.azureedge.net",
]);

export const PROXIED_IMAGE_HOST_SUFFIXES: readonly string[] = [
  ".cdn.gooten.com",
  ".cdn.printful.com",
];

export function isProxiedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (PROXIED_IMAGE_HOSTS.has(host)) return true;
  return PROXIED_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Rewrite a canvas-bound image source so allowlisted supplier CDN
 * images load through the same-origin proxy. Anything else is
 * returned unchanged.
 */
export function canvasImageSrc(src: string): string {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/")) {
    return src;
  }
  try {
    const u = new URL(src);
    if (
      (u.protocol === "http:" || u.protocol === "https:") &&
      isProxiedImageHost(u.hostname)
    ) {
      return `/api/image-proxy?url=${encodeURIComponent(src)}`;
    }
  } catch {
    /* not an absolute URL — pass through */
  }
  return src;
}
