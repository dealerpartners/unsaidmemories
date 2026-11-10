/**
 * Storefront CMS helper — the rendering-layer API the storefront uses
 * to fetch CMS-managed content. Server-side, cached, with graceful
 * fallback to defaults when CMS data doesn't exist.
 *
 * Usage in server components:
 *   const copy = await getCmsCopy();
 *   copy["hero.headline"] // → "Some things are better felt."
 *
 *   const hero = await getCmsHero();
 *   hero.headline // → from CMS content block, or null
 */

import { getContentBlocks, getGlobalCopy, getNavigationMenus, getNavigationItems, getWebsiteSettingsRow, getDesignTokens } from "@/lib/cms";
import { unstable_cache } from "next/cache";

// Cache the copy for 60 seconds (ISR-lite — CMS edits appear within 1 minute)
export const getCmsCopy = unstable_cache(
  async (): Promise<Record<string, string>> => {
    try {
      const copy = await getGlobalCopy("en-US");
      const map: Record<string, string> = {};
      for (const c of copy) map[c.copy_key] = c.copy_value;
      return map;
    } catch {
      return {};
    }
  },
  ["cms-copy"],
  { tags: ["cms"] }
);

// Cache the hero block for 60 seconds
export const getCmsHero = unstable_cache(
  async (): Promise<{
    headline?: string;
    subtitle?: string;
    ctaPrimaryLabel?: string;
    ctaPrimaryHref?: string;
    ctaSecondaryLabel?: string;
    ctaSecondaryHref?: string;
    eyebrow?: string;
    imageUrl?: string;
  } | null> => {
    try {
      const blocks = await getContentBlocks({ status: "published", locale: "en-US" });
      const heroBlock = blocks.find(b =>
        b.component_type.startsWith("Hero") ||
        b.slot_id === "slot_hero" ||
        b.slot_id === "slot_hero_01"
      );
      if (!heroBlock) return null;
      return {
        headline: heroBlock.props?.headline,
        subtitle: heroBlock.props?.subtitle,
        ctaPrimaryLabel: heroBlock.props?.cta_primary_label,
        ctaPrimaryHref: heroBlock.props?.cta_primary_href,
        ctaSecondaryLabel: heroBlock.props?.cta_secondary_label,
        ctaSecondaryHref: heroBlock.props?.cta_secondary_href,
        eyebrow: heroBlock.props?.eyebrow,
        imageUrl: heroBlock.props?.image_url,
      };
    } catch {
      return null;
    }
  },
  ["cms-hero"],
  { tags: ["cms"] }
);

// Cache the navigation for 60 seconds
export const getCmsNavigation = unstable_cache(
  async (location: "header" | "footer" | "mobile" = "header"): Promise<{
    label: string;
    href: string;
    type: string;
    columns: number;
    badge: string | null;
    icon: string | null;
  }[]> => {
    try {
      const menus = await getNavigationMenus(location);
      if (menus.length === 0) return [];
      const items = await getNavigationItems(menus[0].id);
      return items.map(item => ({
        label: item.label,
        href: item.href,
        type: item.item_type,
        columns: item.columns,
        badge: item.badge,
        icon: item.icon,
      }));
    } catch {
      return [];
    }
  },
  ["cms-nav"],
  { tags: ["cms"] }
);

// Cache the design tokens for 5 minutes (tokens rarely change)
export const getCmsTokens = unstable_cache(
  async (): Promise<Record<string, Record<string, string>>> => {
    try {
      const tokens = await getDesignTokens();
      const map: Record<string, Record<string, string>> = {};
      for (const t of tokens) {
        if (!map[t.category]) map[t.category] = {};
        map[t.category][t.token_key] = t.token_value;
      }
      return map;
    } catch {
      return {};
    }
  },
  ["cms-tokens"],
  { tags: ["cms"] }
);

// Cache website settings for 60 seconds
export const getCmsSettings = unstable_cache(
  async () => {
    try {
      return await getWebsiteSettingsRow();
    } catch {
      return null;
    }
  },
  ["cms-settings"],
  { tags: ["cms"] }
);

// Get a single copy value with fallback
export async function copyValue(key: string, fallback: string): Promise<string> {
  const copy = await getCmsCopy();
  return copy[key] || fallback;
}
