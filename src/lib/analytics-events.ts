"use client";

import { readConsentCookie } from "@/lib/consent";

/**
 * The storefront event layer. Every funnel event is pushed to the
 * dataLayer (for Google Tag Manager) and sent to GA4 via gtag when the
 * visitor has granted analytics consent. Without that consent nothing
 * fires — the same gate AnalyticsLoader applies to the tags themselves.
 *
 * Events follow the GA4 ecommerce schema so GA4 audiences, the GTM
 * import workspace, and any future ad pixel all read the same payload.
 */

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  price?: number;
  quantity?: number;
  item_variant?: string;
};

function analyticsAllowed(): boolean {
  try {
    return readConsentCookie()?.analytics === true;
  } catch {
    return false;
  }
}

export function trackEvent(
  event: string,
  params: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  if (!analyticsAllowed()) return;
  try {
    const w = window as unknown as {
      dataLayer?: unknown[];
      gtag?: (...args: unknown[]) => void;
    };
    w.dataLayer = w.dataLayer || [];
    // GA4 enhanced-ecommerce convention: clear the previous ecommerce
    // object before pushing a new one.
    w.dataLayer.push({ ecommerce: null });
    w.dataLayer.push({ event, ...params });
    if (typeof w.gtag === "function") {
      const { currency, value, items, transaction_id } = params as {
        currency?: string;
        value?: number;
        items?: AnalyticsItem[];
        transaction_id?: string;
      };
      w.gtag("event", event, {
        currency: currency ?? "USD",
        value,
        items,
        transaction_id,
      });
    }
  } catch {
    /* analytics must never break the store */
  }
}

export function trackViewItem(item: AnalyticsItem): void {
  trackEvent("view_item", {
    currency: "USD",
    value: item.price,
    items: [item],
  });
}

export function trackAddToCart(item: AnalyticsItem): void {
  trackEvent("add_to_cart", {
    currency: "USD",
    value: item.price != null ? item.price * (item.quantity ?? 1) : undefined,
    items: [item],
  });
}

export function trackBeginCheckout(items: AnalyticsItem[], value: number): void {
  trackEvent("begin_checkout", { currency: "USD", value, items });
}

export function trackPurchase(
  transactionId: string,
  value: number,
  items: AnalyticsItem[],
): void {
  trackEvent("purchase", {
    transaction_id: transactionId,
    currency: "USD",
    value,
    items,
  });
}
