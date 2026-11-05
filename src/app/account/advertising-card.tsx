"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { primaryCtaStyle } from "@/components/commerce/cta-style";

/**
 * Advertising — the advertiser privilege on the customer account.
 *
 * There is no separate advertiser login (owner ruling, 2026-11-02):
 * the same account a customer shops with carries the advertiser
 * privilege. This card is where it attaches — GET /api/ads/account
 * reads it, POST activates it (the ad_advertisers row + the ads
 * identity grant, keyed on this signed-in user) — and the Ad Center
 * at /ads runs on this same session.
 */
type Advertiser = {
  id: string;
  display_name: string | null;
  status: string;
} | null;

export function AdvertisingCard() {
  const [loading, setLoading] = useState(true);
  const [advertiser, setAdvertiser] = useState<Advertiser>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ads/account", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAdvertiser(data.advertiser ?? null);
      }
    } catch {
      // Leave the state as-is; the card still offers the way in.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ads/account", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Activation failed (${res.status})`);
      setAdvertiser(data.advertiser ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Activation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" /> Advertising
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Loading your advertising status…</p>
        ) : advertiser ? (
          <>
            <p>
              Your advertiser account is <strong>active</strong>
              {advertiser.display_name ? (
                <> as <strong>{advertiser.display_name}</strong></>
              ) : null}
              . It runs on this same account — no separate login, ever.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild style={primaryCtaStyle}>
                <Link href="/ads">Open the Ad Center</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/advertise/get-started">Update your brand profile</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              Advertise on Unsaid with the account you already have. Activating
              adds the advertiser privilege to this account — you&apos;ll sign in
              the same way you shop, and the Ad Center opens on this session.
            </p>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button style={primaryCtaStyle} onClick={activate} disabled={busy}>
                {busy ? "Activating…" : "Activate advertiser account"}
              </Button>
              <Button asChild variant="outline">
                <Link href="/advertise">How advertising works</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
