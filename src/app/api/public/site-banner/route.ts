import { NextResponse } from "next/server";
import { getTenantRow } from "@/lib/admin/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The storefront announcement banner, from Website → CMS & Content
 * (tenant settings, cms section: promo_banner_text /
 * promo_banner_link). Returns nulls when no banner is saved — the
 * shell then renders its built-in default line, so the bar is
 * never empty. Public on purpose: this is storefront copy.
 */
export async function GET() {
  let text: string | null = null;
  let link: string | null = null;
  try {
    const tenant = await getTenantRow();
    const cms = (tenant?.settings?.cms ?? {}) as Record<string, unknown>;
    if (typeof cms.promo_banner_text === "string" && cms.promo_banner_text.trim()) {
      text = cms.promo_banner_text.trim();
    }
    if (typeof cms.promo_banner_link === "string" && cms.promo_banner_link.trim()) {
      link = cms.promo_banner_link.trim();
    }
  } catch {
    // A settings hiccup must never break the storefront chrome.
  }
  return NextResponse.json(
    { text, link },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
