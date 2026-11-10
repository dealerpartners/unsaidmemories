import { unstable_cache } from "next/cache";
import { getTenantRow } from "@/lib/admin/data";

/**
 * The storefront's view of Website Settings (Website → Settings +
 * Website → CMS & Content). The admin saves into tenant_settings
 * (sections "website" and "cms"); this reader is the ONE place the
 * storefront reads those values back, so the layout metadata, the
 * footer, the cookie notice and the home hero can never drift apart.
 *
 * Every value is null when unset — callers render their built-in
 * default instead, so an untouched shop renders byte-identically
 * to before this wiring existed. Reads are data-cached for 60s
 * (the same freshness the announcement banner's public route
 * offers), and a settings hiccup resolves to all-nulls: settings
 * must never break the storefront.
 */
export interface WebsiteSettings {
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  cookieConsentText: string | null;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  heroImageUrl: string | null;
}

const EMPTY: WebsiteSettings = {
  seoTitle: null,
  seoDescription: null,
  ogImageUrl: null,
  cookieConsentText: null,
  privacyPolicyUrl: null,
  termsUrl: null,
  heroImageUrl: null,
};

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Hrefs the footer/cookie notice may point at: root-relative paths
 *  or full http(s) URLs. Anything else is treated as unset. */
function href(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  return s.startsWith("/") || s.startsWith("https://") || s.startsWith("http://") ? s : null;
}

/** Image URLs rendered into CSS/metadata: no whitespace, quotes,
 *  parens or backslashes, so the value can never break out of the
 *  url("…") it lands in. Upload (Supabase Storage) URLs pass. */
function imageUrl(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  return /^[^\s"'()\\]+$/.test(s) ? s : null;
}

const readSettings = unstable_cache(
  async (): Promise<WebsiteSettings> => {
    try {
      const tenant = await getTenantRow();
      const web = (tenant?.settings?.website ?? {}) as Record<string, unknown>;
      const cms = (tenant?.settings?.cms ?? {}) as Record<string, unknown>;
      return {
        seoTitle: text(web.seo_title),
        seoDescription: text(web.seo_description),
        ogImageUrl: imageUrl(web.og_image_url),
        cookieConsentText: text(web.cookie_consent_text),
        privacyPolicyUrl: href(web.privacy_policy_url),
        termsUrl: href(web.terms_url),
        heroImageUrl: imageUrl(cms.hero_image_url),
      };
    } catch {
      return EMPTY;
    }
  },
  ["website-settings"],
  { tags: ["website-settings"] },
);

export async function getWebsiteSettings(): Promise<WebsiteSettings> {
  try {
    return await readSettings();
  } catch {
    return EMPTY;
  }
}
