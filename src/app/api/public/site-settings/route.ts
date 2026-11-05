import { NextResponse } from "next/server";
import { getWebsiteSettings } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The storefront-facing Website Settings (Website → Settings +
 * Website → CMS & Content), for the client chrome that cannot read
 * tenant settings itself: the shell's footer Privacy/Terms links
 * and the cookie notice copy. Nulls mean "not set" — the shell
 * renders its built-in defaults, exactly like the announcement
 * banner beside it (/api/public/site-banner). Public on purpose:
 * every value here is published storefront copy — the same strings
 * the server renders into the page metadata and hero.
 */
export async function GET() {
  const s = await getWebsiteSettings();
  return NextResponse.json(
    {
      seoTitle: s.seoTitle,
      seoDescription: s.seoDescription,
      ogImageUrl: s.ogImageUrl,
      cookieConsentText: s.cookieConsentText,
      privacyPolicyUrl: s.privacyPolicyUrl,
      termsUrl: s.termsUrl,
      heroImageUrl: s.heroImageUrl,
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
