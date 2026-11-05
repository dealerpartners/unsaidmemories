"use client";

// LicenseeAdSlot — the Kinnect licensee engine's shop-page slot.
// Fetches the deterministic licensee serve endpoint
// (/api/v1/licensee/serve — same serve-core as /api/ads/serve:
// placement, tier order, flight window, budget, no auction) and
// renders NOTHING when no ad serves, so it is always safe to mount.
// Viewability beacon: when at least half the slot is visible, one
// impression beacon fires to the counter webhook
// (/api/webhooks/ad-events), which increments ad_event_counters via
// the increment_ad_event RPC — the same counters the Supabase Edge
// Function `ad-events` writes. The beacon fires once per served ad.

import { useEffect, useRef, useState } from "react";

type ServedAd = {
  creative_id: string;
  campaign_id: string;
  headline: string | null;
  body: string | null;
  cta: string | null;
  image_url: string | null;
  destination_url: string;
  click_url: string;
};

export function LicenseeAdSlot({
  placement,
  categoryId,
}: {
  placement: string;
  categoryId?: string;
}) {
  const [ad, setAd] = useState<ServedAd | null>(null);
  const boxRef = useRef<HTMLElement | null>(null);
  const beaconedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ placement });
    if (categoryId) params.set("category_id", categoryId);
    fetch(`/api/v1/licensee/serve?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { ads: [] }))
      .then((data: { ads?: ServedAd[] }) => {
        if (!cancelled && data.ads && data.ads.length > 0) {
          setAd(data.ads[0]);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [placement, categoryId]);

  useEffect(() => {
    if (!ad || beaconedRef.current) return;
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !beaconedRef.current) {
          beaconedRef.current = true;
          try {
            const payload = JSON.stringify({
              type: "impression",
              campaign_id: ad.campaign_id,
              creative_id: ad.creative_id,
              placement,
            });
            if (navigator.sendBeacon) {
              const blob = new Blob([payload], {
                type: "application/json",
              });
              navigator.sendBeacon("/api/webhooks/ad-events", blob);
            } else {
              void fetch("/api/webhooks/ad-events", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: payload,
                keepalive: true,
              });
            }
          } catch {
            // A beacon must never break the page.
          }
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ad, placement]);

  if (!ad) return null;

  return (
    <aside
      ref={boxRef}
      aria-label="Sponsored"
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        background: "#ffffff",
        padding: 16,
        margin: "16px 0",
        display: "flex",
        gap: 16,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {ad.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.image_url}
          alt=""
          style={{
            width: 96,
            height: 96,
            objectFit: "cover",
            borderRadius: 8,
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <span
          style={{
            display: "inline-block",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#737373",
            border: "1px solid #e5e5e5",
            borderRadius: 999,
            padding: "2px 8px",
            marginBottom: 8,
          }}
        >
          Ad
        </span>
        {ad.headline && (
          <div style={{ fontSize: 17, fontWeight: 600, color: "#171717" }}>
            {ad.headline}
          </div>
        )}
        {ad.body && (
          <div style={{ fontSize: 14, color: "#525252", marginTop: 4 }}>
            {ad.body}
          </div>
        )}
        <a
          href={ad.click_url}
          style={{
            display: "inline-block",
            marginTop: 10,
            background: "#171717",
            color: "#ffffff",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {ad.cta ?? "Shop now"}
        </a>
      </div>
    </aside>
  );
}
