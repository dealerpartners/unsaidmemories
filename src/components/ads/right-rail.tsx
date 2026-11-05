"use client";

import { useEffect, useState } from "react";
import { useRailConfig } from "@/components/ads/rail-context";

/* ═══════════════════════════════════════════════════════════
   Contextual Right Rail — shows on campaign creation / editing
   pages with 5 panels:
   1. Estimated Results       — the real estimates engine, fed by
                                the config the page publishes
                                (rail-context) or the campaign record
   2. Delivery Likelihood     — same engine
   3. Policy Warnings         — the campaign's real creative review
                                states + declared special category
   4. Recommendations         — prompts derived from the actual
                                configuration (nothing invented)
   5. Activity / Change History — no campaign activity store exists;
                                the panel says so
   With no configuration in context the panels show honest empty
   states. This component previously shipped invented defaults
   (45K–62K impressions, 78% likelihood, a fake "Alex R." activity
   feed) — removed in CP27; the layout had passed only `visible`.
   ═══════════════════════════════════════════════════════════ */

interface RightRailProps {
  /** Set true on campaign creation / editing pages */
  visible?: boolean;
}

const fmtRange = (lo: unknown, hi: unknown) => {
  const a = Number(lo) || 0, b = Number(hi) || 0;
  const f = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(Math.round(n));
  return a && b ? `${f(a)}–${f(b)}` : f(b || a);
};

export function ContextualRightRail({ visible = true }: RightRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { config } = useRailConfig();
  const [campaign, setCampaign] = useState<any>(null);
  const [campaignCreatives, setCampaignCreatives] = useState<any[]>([]);
  const [estimate, setEstimate] = useState<any>(null);
  const [estState, setEstState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");

  /* Campaign context: load the record being edited. */
  useEffect(() => {
    if (!config.campaignId) { setCampaign(null); setCampaignCreatives([]); return; }
    let live = true;
    fetch(`/api/ads/campaigns/${config.campaignId}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.campaign) { setCampaign(d.campaign); setCampaignCreatives(d.creatives ?? []); } })
      .catch(() => {});
    return () => { live = false; };
  }, [config.campaignId]);

  /* Effective estimate inputs: page-published config wins; the
     campaign record is the fallback on edit pages. */
  const budget = config.budgetDollars && config.budgetDollars > 0
    ? config.budgetDollars
    : campaign?.daily_budget_cents
      ? Number(campaign.daily_budget_cents) / 100
      : campaign?.lifetime_budget_cents
        ? Number(campaign.lifetime_budget_cents) / 100
        : 0;
  const keys = (config.placementKeys && config.placementKeys.length > 0)
    ? config.placementKeys
    : (campaign?.placements ?? []).map((p: any) => p?.key ?? p?.code ?? p?.placement_key).filter(Boolean);
  const days = config.days ?? 30;

  useEffect(() => {
    if (!(budget > 0) || keys.length === 0) { setEstimate(null); setEstState("idle"); return; }
    let live = true;
    setEstState("loading");
    const t = setTimeout(() => {
      fetch("/api/ads/estimates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget, days, placement_keys: keys }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!live) return; if (d?.estimate) { setEstimate(d.estimate); setEstState("ready"); } else setEstState("unavailable"); })
        .catch(() => { if (live) setEstState("unavailable"); });
    }, 500);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget, days, keys.join(",")]);

  if (!visible) return null;

  const est = estimate;
  const likelihoodRaw = est?.delivery_likelihood;
  const likelihood = likelihoodRaw == null ? null : likelihoodRaw <= 1 ? Math.round(likelihoodRaw * 100) : Math.round(likelihoodRaw);

  const policyIssues: { severity: "error" | "warning" | "info"; message: string }[] = [];
  const rejected = campaignCreatives.filter((c) => c.status === "rejected");
  const pending = campaignCreatives.filter((c) => c.status === "pending_review" || c.status === "in_review");
  for (const c of rejected) policyIssues.push({ severity: "error", message: `Creative "${c.name}" was rejected in review` });
  if (pending.length) policyIssues.push({ severity: "warning", message: `${pending.length} creative${pending.length === 1 ? " is" : "s are"} waiting in review — they can't run yet` });
  const special = config.specialCategory ?? campaign?.special_category;
  if (special) policyIssues.push({ severity: "info", message: `Special category declared: ${special}` });

  const recommendations: { text: string; priority: "high" | "medium" | "low" }[] = [];
  if (!campaign && !(budget > 0)) recommendations.push({ text: "Set a budget in the form — estimates and delivery likelihood appear here once a budget and placements exist.", priority: "high" });
  if (!campaign && budget > 0 && keys.length === 0) recommendations.push({ text: "No placements picked yet — delivery will use automatic placement. Pick placements to see estimates here.", priority: "medium" });
  if (campaign && campaign.status === "draft") recommendations.push({ text: "This campaign is a draft — launch it from the campaign page when the creatives are approved.", priority: "medium" });
  if (pending.length) recommendations.push({ text: "Creatives in review are the usual launch blocker — check Customer Review for their state.", priority: "low" });

  return (
    <aside className={`shrink-0 border-l border-neutral-200 bg-white transition-all duration-200 ${collapsed ? "w-10" : "w-72"}`}>
      {/* Toggle handle */}
      <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-3">
        {!collapsed && <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Right Rail</h3>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={collapsed ? "" : "rotate-180"}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="overflow-y-auto p-3 space-y-3" style={{ maxHeight: "calc(100vh - 3.5rem)" }}>
          {/* 1. Estimated Results */}
          <RailSection title="Estimated Results" defaultOpen>
            {estState === "ready" && est ? (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-neutral-500">Impressions</span><span className="font-medium text-neutral-900">{fmtRange(est.impressions?.low, est.impressions?.high ?? est.impressions?.mid)}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Clicks</span><span className="font-medium text-neutral-900">{(Number(est.clicks) || 0).toLocaleString("en-US")}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Conversions</span><span className="font-medium text-neutral-900">{(Number(est.conversions) || 0).toLocaleString("en-US")}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Avg. CPM</span><span className="font-medium text-neutral-900">${((Number(est.avg_cpm_cents) || 0) / 100).toFixed(2)}</span></div>
                </div>
                <p className="mt-2 text-[11px] text-neutral-400">From the estimates engine for this budget, flight and placements{est.basis ? ` · basis: ${est.basis}` : ""}</p>
              </>
            ) : estState === "loading" ? (
              <p className="text-sm text-neutral-500">Estimating…</p>
            ) : estState === "unavailable" ? (
              <p className="text-sm text-neutral-500">The estimates engine didn't answer for this configuration.</p>
            ) : (
              <p className="text-sm text-neutral-500">Select a campaign, or set a budget and placements in the form, to see estimates.</p>
            )}
          </RailSection>

          {/* 2. Delivery Likelihood */}
          <RailSection title="Delivery Likelihood" defaultOpen>
            {likelihood != null ? (
              <>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-neutral-900">{likelihood}%</span>
                  <span className="mb-1 text-xs text-neutral-500">likelihood</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-neutral-100">
                  <div
                    className={`h-2 rounded-full transition-all ${likelihood >= 70 ? "bg-emerald-500" : likelihood >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${likelihood}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {likelihood >= 70
                    ? "Good likelihood of full delivery with current budget and targeting."
                    : likelihood >= 40
                      ? "Moderate likelihood. Consider expanding audience or increasing budget."
                      : "Low likelihood. Narrow targeting or low budget may limit delivery."}
                </p>
              </>
            ) : (
              <p className="text-sm text-neutral-500">Configure a budget and placements to estimate delivery likelihood.</p>
            )}
          </RailSection>

          {/* 3. Policy Warnings */}
          <RailSection title="Policy Warnings" defaultOpen={policyIssues.length > 0}>
            {!campaign && !special ? (
              <p className="text-sm text-neutral-500">Policy state is read from a campaign's creatives and declared category — neither is in context on this page yet.</p>
            ) : policyIssues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                No policy issues
              </div>
            ) : (
              <div className="space-y-1.5">
                {policyIssues.map((issue, i) => (
                  <div key={i} className={`flex items-start gap-1.5 rounded p-2 text-xs ${
                    issue.severity === "error" ? "bg-red-50 text-red-700" : issue.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                  }`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                      {issue.severity === "error"
                        ? <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>
                        : <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>}
                    </svg>
                    {issue.message}
                  </div>
                ))}
              </div>
            )}
          </RailSection>

          {/* 4. Recommendations */}
          <RailSection title="Recommendations" defaultOpen>
            {recommendations.length === 0 ? (
              <p className="text-sm text-neutral-500">Nothing to recommend from the current configuration.</p>
            ) : (
              <div className="space-y-2">
                {recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-neutral-100 p-2.5 text-xs">
                    <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      rec.priority === "high" ? "bg-red-50 text-red-600" : rec.priority === "medium" ? "bg-amber-50 text-amber-600" : "bg-neutral-100 text-neutral-500"
                    }`}>
                      {rec.priority}
                    </span>
                    <span className="text-neutral-700">{rec.text}</span>
                  </div>
                ))}
              </div>
            )}
          </RailSection>

          {/* 5. Activity / Change History */}
          <RailSection title="Activity / Change History" defaultOpen={false}>
            <p className="text-sm text-neutral-500">Campaign change history isn't recorded in this system — there is no activity log behind this panel, and the sample feed that used to appear here wasn't real.</p>
          </RailSection>
        </div>
      )}
    </aside>
  );
}

/* ─── Collapsible rail section ─── */
function RailSection({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-neutral-100 bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold text-neutral-700"
      >
        {title}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="border-t border-neutral-50 px-3 py-3">{children}</div>}
    </div>
  );
}
