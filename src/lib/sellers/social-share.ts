// ---------------------------------------------------------------------------
// sellers/social-share.ts — the share-intent layer for seller social push.
//
// "Post once, push out": a seller promotes a listing from one place and
// every network carries the listing's REAL public URL + title back to the
// platform. The network set is the one the codebase already references in
// its footers (src/components/site/footer.tsx, seopages/Footer.tsx,
// site-chrome.tsx): Facebook, Instagram, TikTok, Pinterest.
//
// Only networks with a real web share-intent endpoint get an intent link:
//   * Facebook  — sharer/sharer.php?u=
//   * X         — intent/tweet (the footers predate X; the intent endpoint
//                 is the live successor of the Twitter share URL)
//   * WhatsApp  — wa.me/?text=
//   * Threads   — threads.net/intent/post?text=
//   * Pinterest — pin/create/button (for the API push see the
//                 /api/seller/social route; this is the no-API fallback)
//   * Email     — mailto:
//   * Copy link — clipboard, no network endpoint needed
// Instagram and TikTok publish NO web share-intent endpoint, so they get
// no fake button here — a seller reaches them via copy-link (the share
// component labels that button for Instagram). Inventing a dead intent
// URL would be a stub, so there is none.
//
// Every intent URL carries UTM attribution on the PLATFORM link itself
// (utm_source=<network>, utm_medium=social, utm_campaign=seller_share,
// plus utm_content=seller_<id> when the seller is known), so traffic a
// post drives back lands attributed to the network and the seller.
// ---------------------------------------------------------------------------

import { SITE_URL } from "@/lib/site-url";

/** The listing's canonical public URL — PDPs resolve at /products/{slug}. */
export function listingPublicUrl(slug: string): string {
  return `${SITE_URL}/products/${slug}`;
}

/** The seller's canonical public storefront URL. */
export function storefrontPublicUrl(sellerSlug: string): string {
  return `${SITE_URL}/seller/${sellerSlug}`;
}

export interface ShareTarget {
  /** Absolute public URL being shared (the listing's PDP). */
  url: string;
  /** The listing's real title. */
  title: string;
  /** The listing's real primary image URL, when it has one. */
  imageUrl?: string | null;
  /** Optional real description text (listing description, when present). */
  description?: string | null;
  /** The seller's id, when known — carried as utm_content so inbound
   * traffic attributes back to this seller. */
  sellerId?: string | null;
}

export type ShareNetwork =
  | "facebook"
  | "x"
  | "whatsapp"
  | "threads"
  | "pinterest"
  | "email";

/** The platform URL with this network's UTM attribution applied. */
export function attributedShareUrl(
  url: string,
  network: ShareNetwork,
  sellerId?: string | null,
): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", network);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", "seller_share");
  if (sellerId) u.searchParams.set("utm_content", `seller_${sellerId}`);
  return u.toString();
}

export interface ShareIntent {
  network: ShareNetwork;
  label: string;
  href: string;
}

/** Build every share-intent link for a target from its real fields only. */
export function shareIntents(target: ShareTarget): ShareIntent[] {
  const text = target.title;
  const urlFor = (network: ShareNetwork) =>
    attributedShareUrl(target.url, network, target.sellerId);
  const intents: ShareIntent[] = [
    {
      network: "facebook",
      label: "Share on Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(urlFor("facebook"))}`,
    },
    {
      network: "x",
      label: "Share on X",
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(urlFor("x"))}&text=${encodeURIComponent(text)}`,
    },
    {
      network: "whatsapp",
      label: "Share on WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${text}\n${urlFor("whatsapp")}`)}`,
    },
    {
      network: "threads",
      label: "Share on Threads",
      href: `https://www.threads.net/intent/post?text=${encodeURIComponent(`${text}\n${urlFor("threads")}`)}`,
    },
  ];
  // Pinterest's create-button intent needs the media it will pin; without
  // a real image there is nothing honest to prefill, so it is omitted.
  if (target.imageUrl) {
    const desc = target.description?.trim() || text;
    intents.push({
      network: "pinterest",
      label: "Pin on Pinterest",
      href:
        `https://www.pinterest.com/pin/create/button/` +
        `?url=${encodeURIComponent(urlFor("pinterest"))}` +
        `&media=${encodeURIComponent(target.imageUrl)}` +
        `&description=${encodeURIComponent(desc)}`,
    });
  }
  intents.push({
    network: "email",
    label: "Share by email",
    href:
      `mailto:?subject=${encodeURIComponent(text)}` +
      `&body=${encodeURIComponent(`${text}\n${urlFor("email")}`)}`,
  });
  return intents;
}
