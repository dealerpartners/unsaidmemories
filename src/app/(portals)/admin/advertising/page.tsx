"use client";

// /admin/advertising — Advertising / Ad Center (owner's feature tree).
// The views are Sunny's MARKETING.html Advertising designs (Overview,
// Campaigns, Creatives, Audiences, Billing & spend) wired to the real
// /api/admin/ads/* endpoints. The pre-existing Advertising Operations
// console (review desk, rate cards, placements, house inventory) is
// preserved whole as the "Ad Center console" view — LegacyConsole.tsx
// is that component, moved verbatim, not deleted.

import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { MktPage, useToast } from "@/components/admin/marketing/frame";
import AdsOverview from "@/components/admin/marketing/ads/AdsOverview";
import AdsCampaigns from "@/components/admin/marketing/ads/AdsCampaigns";
import AdsCreatives from "@/components/admin/marketing/ads/AdsCreatives";
import AdsAudiences from "@/components/admin/marketing/ads/AdsAudiences";
import AdsBilling from "@/components/admin/marketing/ads/AdsBilling";
import LegacyConsole from "@/components/admin/marketing/ads/LegacyConsole";
import "@/components/admin/marketing/marketing.css";

const VIEWS = [
  { key: "overview", label: "Overview", title: "Advertising overview" },
  { key: "campaigns", label: "Campaigns", title: "Campaigns" },
  { key: "creatives", label: "Creatives", title: "Creatives" },
  { key: "audiences", label: "Audiences", title: "Audiences" },
  { key: "billing", label: "Billing & spend", title: "Billing & spend" },
  { key: "console", label: "Ad Center console", title: "Ad Center console" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

export default function AdvertisingPage() {
  const [view, setView] = useState<ViewKey>("overview");
  const { toast, node } = useToast();
  const title = VIEWS.find((v) => v.key === view)?.title ?? "Advertising overview";

  const actions = (
    <>
      {view === "overview" && (
        <button className="btn" onClick={() => toast("Export isn't wired for this view yet.")}>
          <Download /> Export
        </button>
      )}
      {(view === "overview" || view === "campaigns") && (
        <button className="btn primary" onClick={() => toast("Campaigns are created by advertisers in the Ad Center — this console reviews and manages their delivery.")}>
          <Plus /> New campaign
        </button>
      )}
      {view === "creatives" && (
        <button className="btn primary" onClick={() => toast("Creatives arrive with advertiser campaigns — approve or reject them here.")}>
          <Plus /> Upload creative
        </button>
      )}
      {view === "audiences" && (
        <button className="btn primary" onClick={() => toast("Saved audiences aren't supported yet — the ad platform has no audience store.")}>
          <Plus /> New audience
        </button>
      )}
    </>
  );

  return (
    <MktPage title={title} actions={actions}>
      {node}
      <div className="viewtabs">
        {VIEWS.map((v) => (
          <button key={v.key} className={`viewtab ${view === v.key ? "active" : ""}`} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>
      {view === "overview" && <AdsOverview />}
      {view === "campaigns" && <AdsCampaigns />}
      {view === "creatives" && <AdsCreatives />}
      {view === "audiences" && <AdsAudiences />}
      {view === "billing" && <AdsBilling />}
      {view === "console" && <LegacyConsole />}
    </MktPage>
  );
}
