"use client";

import { useEffect, useState } from "react";
import { usePublishRailConfig } from "@/components/ads/rail-context";
import { useRouter } from "next/navigation";
import { PageHeader, Button, FormField, EstimatePanel } from "@/components/ads/ui";

const STEPS = [
  "Creation Method",
  "Objectives",
  "Campaign Setup",
  "Plan & Commitment",
  "Ad Group Setup",
  "Create Ad",
  "Review & Launch",
];

type Placement = { key: string; name: string };
type LibraryCreative = { id: string; name: string; asset_url: string; click_url: string; cta: string | null };

export default function CreateCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState("guided");
  const [objective, setObjective] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [specialCategory, setSpecialCategory] = useState("none");
  const [splitTest, setSplitTest] = useState(false);
  const [plan, setPlan] = useState("standard");
  const [cbo, setCbo] = useState(true);
  const [budget, setBudget] = useState("5000");
  const [budgetPeriod, setBudgetPeriod] = useState("daily");
  const [budgetStrategy, setBudgetStrategy] = useState("maximize");
  const [selectedCreative, setSelectedCreative] = useState("");
  const [cta, setCta] = useState("Learn More");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [pickedPlacements, setPickedPlacements] = useState<Set<string>>(new Set());
  const [library, setLibrary] = useState<LibraryCreative[]>([]);
  const [estimate, setEstimate] = useState<{ impressions: string; clicks: string; cpm: string; likelihood?: number }>({ impressions: "—", clicks: "—", cpm: "—" });
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/ads/placements").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.placements) setPlacements(d.placements); }).catch(() => {});
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.creatives) setLibrary(d.creatives); }).catch(() => {});
  }, []);

  const budgetNum = Number(budget || 0);
  usePublishRailConfig({ budgetDollars: budgetNum, placementKeys: [...pickedPlacements], days: budgetPeriod === "daily" ? 1 : budgetPeriod === "weekly" ? 7 : 30 });
  useEffect(() => {
    if (!(budgetNum > 0) || pickedPlacements.size === 0) return;
    const days = budgetPeriod === "daily" ? 1 : budgetPeriod === "weekly" ? 7 : 30;
    const t = setTimeout(() => {
      fetch("/api/ads/estimates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget: budgetPeriod === "daily" ? budgetNum : budgetNum, days, placement_keys: [...pickedPlacements] }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const e = d?.estimate; if (!e) return;
          const fmt = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(Math.round(n)));
          const lik = e.delivery_likelihood != null ? (Number(e.delivery_likelihood) <= 1 ? Math.round(Number(e.delivery_likelihood) * 100) : Math.round(Number(e.delivery_likelihood))) : undefined;
          setEstimate({ impressions: `${fmt(Number(e.impressions?.low ?? 0))} – ${fmt(Number(e.impressions?.high ?? 0))}`, clicks: fmt(Number(e.clicks ?? 0)), cpm: "$" + (Number(e.avg_cpm_cents ?? 0) / 100).toFixed(2), likelihood: lik });
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [budgetNum, budgetPeriod, pickedPlacements]);

  const togglePlacement = (key: string) => {
    const n = new Set(pickedPlacements);
    if (n.has(key)) n.delete(key); else n.add(key);
    setPickedPlacements(n);
  };

  const submit = (launch: boolean) => {
    setNote("");
    if (!campaignName.trim()) { setNote("Give the campaign a name first (step 3)."); setStep(2); return; }
    setSubmitting(true);
    const cents = Math.round(budgetNum * 100);
    const body: Record<string, unknown> = {
      name: campaignName.trim(),
      special_category: specialCategory === "none" ? null : specialCategory === "social" ? "social_issues" : specialCategory,
      placements: [...pickedPlacements],
    };
    if (budgetPeriod === "daily") body.daily_budget_cents = cents;
    else if (budgetPeriod === "weekly") { body.lifetime_budget_cents = cents; body.ends_at = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(); }
    else body.lifetime_budget_cents = cents;
    const picked = library.find((c) => c.id === selectedCreative);
    if (picked?.asset_url) {
      body.creatives = [{ name: picked.name, asset_url: picked.asset_url, click_url: destinationUrl.trim() || picked.click_url, cta }];
    }
    fetch("/api/ads/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "create_failed"); return d; })
      .then(async (d) => {
        const cid = d.campaign_id;
        if (launch && cid) await fetch(`/api/ads/campaigns/${cid}/launch`, { method: "POST" }).catch(() => {});
        router.push(cid ? `/ads/campaigns/${cid}` : "/ads/ads-manager/campaigns");
      })
      .catch((e) => { setNote("Couldn't create the campaign: " + String(e?.message || "unknown error")); setSubmitting(false); });
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        title="Create Campaign"
        description={`Step ${step + 1} of 7 — ${STEPS[step]}`}
        breadcrumbs={[{ label: "Ads Manager", href: "/ads/ads-manager" }, { label: "Campaigns", href: "/ads/ads-manager/campaigns" }, { label: "Create" }]}
      />

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
              i === step ? "bg-[#f2eafe] text-[#6942c2]" : i < step ? "bg-emerald-500 text-white" : "bg-neutral-100 text-neutral-400"
            }`}>
              {i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 w-6 ${i < step ? "bg-emerald-500" : "bg-neutral-100"}`} />}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        {/* Step 1: Creation Method */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Choose how to create your campaign</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { id: "guided", label: "Guided Setup", desc: "Step-by-step wizard with recommendations and best practices" },
                { id: "quick", label: "Quick Create", desc: "Fast setup with essential fields only — perfect for experienced advertisers" },
                { id: "import", label: "Import", desc: "Import settings from an existing campaign or CSV file" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`rounded-xl border-2 p-5 text-left transition-colors ${
                    method === m.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-100 hover:border-neutral-200"
                  }`}
                >
                  <h3 className="text-sm font-semibold text-neutral-900">{m.label}</h3>
                  <p className="mt-1 text-xs text-neutral-500">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Objectives */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Select your advertising objective</h2>
            <div className="space-y-6">
              {/* Awareness */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-700 mb-2">Awareness</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button onClick={() => setObjective("reach")} className={`rounded-lg border p-4 text-left ${objective === "reach" ? "border-neutral-900 bg-neutral-50" : "border-neutral-100"}`}>
                    <h4 className="text-sm font-medium text-neutral-900">Reach</h4>
                    <p className="text-xs text-neutral-500">Show your ad to the maximum number of people</p>
                  </button>
                </div>
              </div>
              {/* Consideration */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-700 mb-2">Consideration</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { id: "traffic", label: "Traffic", desc: "Drive clicks to your website or app" },
                    { id: "video-views", label: "Video Views", desc: "Maximize video views and engagement" },
                    { id: "community", label: "Community Interaction", desc: "Grow followers and engagement" },
                    { id: "brand-consideration", label: "Brand Consideration", desc: "Increase brand recall and favorability" },
                    { id: "music-streams", label: "Music Streams", desc: "Drive streams on the music platform" },
                  ].map((o) => (
                    <button key={o.id} onClick={() => setObjective(o.id)} className={`rounded-lg border p-4 text-left ${objective === o.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-100"}`}>
                      <h4 className="text-sm font-medium text-neutral-900">{o.label}</h4>
                      <p className="text-xs text-neutral-500">{o.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              {/* Conversion */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-700 mb-2">Conversion</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { id: "app-promotion", label: "App Promotion", desc: "Drive app installs and engagement" },
                    { id: "lead-gen", label: "Lead Generation", desc: "Collect leads with instant forms" },
                    { id: "sales", label: "Sales", desc: "Drive purchases and conversions" },
                  ].map((o) => (
                    <button key={o.id} onClick={() => setObjective(o.id)} className={`rounded-lg border p-4 text-left ${objective === o.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-100"}`}>
                      <h4 className="text-sm font-medium text-neutral-900">{o.label}</h4>
                      <p className="text-xs text-neutral-500">{o.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Campaign Setup */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-neutral-900">Campaign Setup</h2>
            <FormField label="Campaign Name" description="A descriptive name to identify this campaign">
              <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g., Summer Launch 2025" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
            </FormField>
            <FormField label="Special Ad Category" description="Required for ads about credit, employment, housing, or social issues">
              <select value={specialCategory} onChange={(e) => setSpecialCategory(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                <option value="none">None</option>
                <option value="credit">Credit</option>
                <option value="employment">Employment</option>
                <option value="housing">Housing</option>
                <option value="social">Social Issues</option>
              </select>
            </FormField>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-neutral-700">Enable Split Test (A/B)</label>
              <button onClick={() => setSplitTest(!splitTest)} className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${splitTest ? "bg-emerald-500" : "bg-neutral-200"}`}>
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${splitTest ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>
            {splitTest && (
              <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-4 text-sm text-neutral-600">
                Split test enabled. Your campaign will create two ad sets with different variables to test performance.
              </div>
            )}
          </div>
        )}

        {/* Step 4: Plan & Commitment */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-neutral-900">Plan, Budget & Commitment</h2>
            <FormField label="Plan Selection">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { id: "standard", label: "Standard", desc: "Pay per impression, full flexibility" },
                  { id: "committed", label: "Committed", desc: "Volume commitment with CPM discounts" },
                  { id: "premium", label: "Premium", desc: "Guaranteed delivery with priority access" },
                ].map((p) => (
                  <button key={p.id} onClick={() => setPlan(p.id)} className={`rounded-lg border-2 p-4 text-left ${plan === p.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-100"}`}>
                    <h4 className="text-sm font-semibold text-neutral-900">{p.label}</h4>
                    <p className="text-xs text-neutral-500">{p.desc}</p>
                  </button>
                ))}
              </div>
            </FormField>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-neutral-700">Campaign Budget Optimization (CBO)</label>
              <button onClick={() => setCbo(!cbo)} className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${cbo ? "bg-emerald-500" : "bg-neutral-200"}`}>
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${cbo ? "translate-x-4" : "translate-x-0"}`} />
              </button>
              <span className="text-xs text-neutral-500">Distribute budget across ad groups automatically</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="Budget Amount">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">$</span>
                  <input value={budget} onChange={(e) => setBudget(e.target.value)} type="number" className="w-full rounded-lg border border-neutral-200 py-2 pl-7 pr-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" />
                </div>
              </FormField>
              <FormField label="Budget Allocation">
                <select value={budgetPeriod} onChange={(e) => setBudgetPeriod(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="lifetime">Lifetime</option>
                </select>
              </FormField>
              <FormField label="Budget Strategy">
                <select value={budgetStrategy} onChange={(e) => setBudgetStrategy(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                  <option value="maximize">Maximize Results</option>
                  <option value="target-cpa">Target CPA</option>
                  <option value="target-roas">Target ROAS</option>
                  <option value="bid-cap">Bid Cap</option>
                </select>
              </FormField>
            </div>
            <EstimatePanel
              estimates={[
                { label: "Estimated Impressions", value: estimate.impressions },
                { label: "Estimated Clicks", value: estimate.clicks },
                { label: "Estimated CPM", value: estimate.cpm },
              ]}
              deliveryLikelihood={estimate.likelihood}
            />
          </div>
        )}

        {/* Step 5: Ad Group Setup */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-neutral-900">Ad Group Setup</h2>
            <FormField label="Placements" description="Choose where your ads will appear">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {placements.length === 0 && <p className="text-sm text-neutral-500">Loading placements… (none picked = automatic)</p>}
                {placements.map((pl) => (
                  <label key={pl.key} className="flex items-center gap-2 rounded-lg border border-neutral-100 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
                    <input type="checkbox" checked={pickedPlacements.has(pl.key)} onChange={() => togglePlacement(pl.key)} className="h-4 w-4 rounded border-neutral-300" />
                    {pl.name}
                  </label>
                ))}
              </div>
            </FormField>
            <FormField label="Audience Targeting">
              <div className="flex flex-wrap gap-2">
                {["Age 18-34", "Music Enthusiasts", "US Only", "English"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                    {t}
                    <button className="text-neutral-400 hover:text-neutral-600">×</button>
                  </span>
                ))}
                <button className="rounded-full border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500 hover:border-neutral-400">
                  + Add targeting
                </button>
              </div>
            </FormField>
            <FormField label="Bidding Strategy">
              <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                <option>Automatic — Maximize results</option>
                <option>Manual CPM</option>
                <option>Target CPA</option>
                <option>Target ROAS</option>
              </select>
            </FormField>
            <FormField label="Frequency Capping" description="Limit how often a user sees your ad">
              <div className="flex items-center gap-2">
                <input type="number" defaultValue={3} className="w-20 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" />
                <span className="text-sm text-neutral-500">impressions per</span>
                <select className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                  <option>day</option>
                  <option>week</option>
                  <option>month</option>
                </select>
              </div>
            </FormField>
            <FormField label="Brand Safety">
              <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                <option>Standard — Block sensitive content</option>
                <option>Strict — Block more categories</option>
                <option>Limited — Maximum brand safety</option>
              </select>
            </FormField>
          </div>
        )}

        {/* Step 6: Create Ad */}
        {step === 5 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-neutral-900">Create Your Ad</h2>
            <FormField label="Creative">
              <div className="flex items-start gap-3">
                <select value={selectedCreative} onChange={(e) => setSelectedCreative(e.target.value)} className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                  <option value="">Select an existing creative…</option>
                  {library.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
                <Button variant="secondary" onClick={() => {}}>+ Create New</Button>
              </div>
            </FormField>
            <FormField label="Call-to-Action (CTA)">
              <select value={cta} onChange={(e) => setCta(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                {["Learn More", "Shop Now", "Listen Now", "Download", "Sign Up", "Watch More", "Get Offer", "Contact Us"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Destination URL">
              <input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://example.com/landing" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
            </FormField>
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-6 text-center">
              <p className="text-sm text-neutral-500">Ad Preview</p>
              <div className="mt-4 mx-auto max-w-sm rounded-lg border border-neutral-200 bg-white p-4">
                <div className="h-24 rounded bg-neutral-100 flex items-center justify-center text-xs text-neutral-400">Creative Preview</div>
                <p className="mt-2 text-sm font-medium text-neutral-900">{campaignName || "Your Campaign"}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{cta}</p>
                <p className="text-xs text-neutral-400 mt-0.5 truncate">{destinationUrl || "https://example.com"}</p>
              </div>
            </div>
          </div>
        )}

        {note && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{note}</div>}

        {/* Step 7: Review & Launch */}
        {step === 6 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-neutral-900">Review & Launch</h2>
            <div className="rounded-xl border border-neutral-100 bg-white p-5 space-y-3">
              <h3 className="text-sm font-semibold text-neutral-900">Campaign Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-neutral-500">Name:</span> <span className="font-medium text-neutral-900">{campaignName || "Untitled Campaign"}</span></div>
                <div><span className="text-neutral-500">Method:</span> <span className="font-medium text-neutral-900 capitalize">{method}</span></div>
                <div><span className="text-neutral-500">Objective:</span> <span className="font-medium text-neutral-900">{objective || "Not selected"}</span></div>
                <div><span className="text-neutral-500">Special Category:</span> <span className="font-medium text-neutral-900">{specialCategory}</span></div>
                <div><span className="text-neutral-500">Plan:</span> <span className="font-medium text-neutral-900 capitalize">{plan}</span></div>
                <div><span className="text-neutral-500">Budget:</span> <span className="font-medium text-neutral-900">${budget} {budgetPeriod}</span></div>
                <div><span className="text-neutral-500">CBO:</span> <span className="font-medium text-neutral-900">{cbo ? "On" : "Off"}</span></div>
                <div><span className="text-neutral-500">Split Test:</span> <span className="font-medium text-neutral-900">{splitTest ? "On" : "Off"}</span></div>
                <div><span className="text-neutral-500">CTA:</span> <span className="font-medium text-neutral-900">{cta}</span></div>
                <div><span className="text-neutral-500">Destination:</span> <span className="font-medium text-neutral-900 truncate block">{destinationUrl || "—"}</span></div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-4">
              <Button variant="secondary" onClick={() => submit(false)} disabled={submitting}>Save as Draft</Button>
              <Button variant="secondary" onClick={() => submit(true)} disabled={submitting}>Submit Action Request</Button>
              <Button onClick={() => submit(true)} disabled={submitting}>Launch Campaign</Button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))} disabled={step === 1 && !objective}>
            Continue
          </Button>
        ) : (
          <Button onClick={() => submit(true)} disabled={submitting}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
