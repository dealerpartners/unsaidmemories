import type { NextRequest } from "next/server"

// ---------------------------------------------------------------------------
// The salon's real domain. Stripe checkout callbacks (success/cancel/return
// URLs) and canonical links always point here. NEXT_PUBLIC_SITE_URL can
// override it for preview deployments, but the default is the live site.
// ---------------------------------------------------------------------------

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.unsaidmemories.com").replace(/\/$/, "")

// Base for Stripe success/cancel/return URLs.
export function callbackBase(_req?: NextRequest): string {
  return SITE_URL
}
