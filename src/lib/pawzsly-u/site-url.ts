import type { NextRequest } from "next/server"

// ---------------------------------------------------------------------------
// The salon's real domain. Stripe checkout callbacks (success/cancel/return
// URLs) and canonical links always point here. NEXT_PUBLIC_SITE_URL can
// override it for preview deployments, but the default is the live site.
// ---------------------------------------------------------------------------

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.aapawz.com").replace(/\/$/, "")

export const SEO_BASE_PATH = "/pawzsly-u/memphis"
export const SEO_SITE_URL = `${SITE_URL}${SEO_BASE_PATH}`

export function seoUrl(path: string): string {
  return `${SEO_SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}

export function seoAsset(path: string): string {
  if (/^(?:https?:)?\/\//.test(path)) return path
  return `${SEO_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`
}

// Base for Stripe success/cancel/return URLs.
export function callbackBase(_req?: NextRequest): string {
  return SITE_URL
}
