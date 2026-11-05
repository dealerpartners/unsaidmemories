"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePublishRailConfig } from "@/components/ads/rail-context";
import { useRouter } from "next/navigation";
import { PageHeader, Button, FormField, EstimatePanel, PolicyPanel, StatusToggle } from "@/components/ads/ui";

const steps = ["Creation Method", "Objective", "Campaign Setup", "Plan & Commitment", "Ad Group Setup", "Ad Creation", "Review & Launch"];

const objectives = [
  { category: "Awareness", items: ["Reach"] },
  { category: "Consideration", items: ["Traffic", "Video Views", "Community Interaction", "Brand Consideration", "Music Streams"] },
  { category: "Conversion", items: ["App Promotion", "Lead Generation", "Sales"] },
];

const methods = [
  { id: "blank", label: "Blank build", desc: "Start from scratch with full control over every setting." },
  { id: "plan", label: "Plan-led build", desc: "Choose a plan first; recommended settings are pre-filled." },
  { id: "duplicate", label: "Duplicate existing campaign", desc: "Copy an existing campaign and modify as needed." },
  { id: "template", label: "Use template", desc: "Start with a proven template for your objective." },
];

type BudgetTier = { id: number; name: string; min_daily_budget: number | string; max_daily_budget: number | string | null; recommendation: string | null; features: unknown };
type Placement = { id: string; key: string; name: string; description: string | null; cpm_cents: number | null };

export default function CreateCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState("");
  const [objective, setObjective] = useState("");
  const [subObjective, setSubObjective] = useState("");
  const [name, setName] = useState("");
  const [specialCategory, setSpecialCategory] = useState("");
  const [tiers, setTiers] = useState<BudgetTier[]>([]);
  const [planId, setPlanId] = useState<number | null>(null);
  const [commitment, setCommitment] = useState("Daily");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [groupName, setGroupName] = useState("");
  const [language, setLanguage] = useState("");
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [pickedPlacements, setPickedPlacements] = useState<Set<string>>(new Set());
  const [adName, setAdName] = useState("");
  const [cta, setCta] = useState("Learn More");
  const [destUrl, setDestUrl] = useState("");
  const [estimate, setEstimate] = useState<{ reach: string; clicks: string; cpm: string; likelihood?: number }>({ reach: "—", clicks: "—", cpm: "—" });
  const [submitNote, setSubmitNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/ads/budget-tiers").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.tiers) setTiers(d.tiers); }).catch(() => {});
    fetch("/api/ads/placements").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.placements) setPlacements(d.placements); else if (Array.isArray(d)) setPlacements(d); }).catch(() => {});
  }, []);

  const budgetNum = Number(budgetAmount || 0);
  usePublishRailConfig({ budgetDollars: budgetNum, placementKeys: [...pickedPlacements], days: commitment === "Weekly" ? 7 : 30 });
  useEffect(() => {
    if (step < 3 || !(budgetNum > 0) || pickedPlacements.size === 0) return;
    const t = setTimeout(() => {
      fetch("/api/ads/estimates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget: budgetNum, days: commitment === "Weekly" ? 7 : 30, placement_keys: [...pickedPlacements] }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const e = d?.estimate; if (!e) return;
          const mid = Number(e.impressions?.mid ?? 0);
          const fmt = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(n));
          const lik = e.delivery_likelihood != null ? (Number(e.delivery_likelihood) <= 1 ? Math.round(Number(e.delivery_likelihood) * 100) : Math.round(Number(e.delivery_likelihood))) : undefined;
          setEstimate({ reach: "~" + fmt(mid), clicks: "~" + Number(e.clicks ?? 0).toLocaleString("en-US"), cpm: "$" + (Number(e.avg_cpm_cents ?? 0) / 100).toFixed(2), likelihood: lik });
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [step, budgetNum, commitment, pickedPlacements]);

  const togglePlacement = (key: string) => {
    const n = new Set(pickedPlacements);
    if (n.has(key)) n.delete(key); else n.add(key);
    setPickedPlacements(n);
  };

  const submit = (publish: boolean) => {
    setSubmitNote("");
    if (!name.trim()) { setSubmitNote("Give the campaign a name first (step 3)."); setStep(2); return; }
    setSubmitting(true);
    const centsTotal = Math.round(budgetNum * 100);
    const body: Record<string, unknown> = {
      name: name.trim(),
      special_category: specialCategory || null,
      group_name: groupName.trim() || "Group 1",
      placements: [...pickedPlacements],
    };
    if (language.trim()) body.targeting = { language_codes: [language.trim()] };
    if (commitment === "Daily") body.daily_budget_cents = centsTotal;
    else if (commitment === "Monthly") body.lifetime_budget_cents = centsTotal;
    else { body.lifetime_budget_cents = centsTotal; body.ends_at = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(); }
    fetch("/api/ads/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "create_failed"); return d; })
      .then(async (d) => {
        const cid = d.campaign?.id ?? d.campaign_id ?? d.id;
        if (publish && cid) {
          await fetch(`/api/ads/campaigns/${cid}/launch`, { method: "POST" }).catch(() => {});
        }
        router.push(cid ? `/ads/campaigns/${cid}` : "/ads/campaigns");
      })
      .catch((e) => { setSubmitNote("Couldn't create the campaign: " + String(e?.message || "unknown error")); setSubmitting(false); });
  };

  return (
    <div>
      <PageHeader title="Create Campaign" description={`Step ${step + 1} of 7 — ${steps[step]}`} />

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${i < step ? "bg-[#f2eafe] text-[#6942c2]" : i === step ? "border-2 border-neutral-900 text-neutral-900" : "border border-neutral-200 text-neutral-400"}`}>
              {i < step ? "✓" : i + 1}
            </div>
            {i < steps.length - 1 && <div className={`h-px w-6 ${i < step ? "bg-neutral-900" : "bg-neutral-200"}`} />}
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        <div className="flex-1">
          {/* Step 0: Creation Method */},
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-neutral-900">How do you want to create your campaign?</h2>
              <div className="grid grid-cols-2 gap-4">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`rounded-xl border p-5 text-left transition-colors ${method === m.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-300"}`}
                  >
                    <h3 className="text-sm font-semibold text-neutral-900">{m.label}</h3>
                    <p className="mt-1 text-xs text-neutral-500">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )},

          {/* Step 1: Objective */},
          {step === 1 && (
            <div className="space-y-6">
              {objectives.map((cat) => (
                <div key={cat.category}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">{cat.category}</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {cat.items.map((item) => (
                      <button
                        key={item}
                        onClick={() => { setObjective(cat.category); setSubObjective(item); }}
                        className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${subObjective === item ? "border-neutral-900 bg-neutral-50 text-neutral-900" : "border-neutral-200 text-neutral-600 hover:border-neutral-300"}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )},

          {/* Step 2: Campaign Setup */},
          {step === 2 && (
            <div className="max-w-xl space-y-5">
              <FormField label="Campaign name">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Launch 2026" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none" />
              </FormField>
              <FormField label="Special ad category" description="Required for ads about credit, employment, housing, or social issues.">
                <select value={specialCategory} onChange={(e) => setSpecialCategory(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                  <option value="">None</option>
                  <option value="credit">Credit</option>
                  <option value="employment">Employment</option>
                  <option value="housing">Housing</option>
                  <option value="social_issues">Social Issues</option>
                </select>
              </FormField>
              <FormField label="Split test" description="Run an A/B test on this campaign.">
                <StatusToggle active={false} onToggle={() => {}} />
              </FormField>
            </div>
          )},

          {/* Step 3: Plan & Commitment */},
          {step === 3 && (
            <div className="max-w-xl space-y-5">
              <h2 className="text-lg font-semibold text-neutral-900">Select your plan</h2>
              <div className="grid grid-cols-2 gap-4">
                {tiers.length === 0 && <p className="text-sm text-neutral-500">Loading plans…</p>}
                {tiers.map((t) => (
                  <div key={t.id} onClick={() => setPlanId(t.id)} className={`cursor-pointer rounded-xl border p-5 ${planId === t.id ? "border-neutral-900" : "border-neutral-200"}`}>
                    <h3 className="text-sm font-semibold text-neutral-900">{t.name}</h3>
                    <p className="mt-1 text-xs text-neutral-500">
                      ${Number(t.min_daily_budget).toLocaleString("en-US")}{t.max_daily_budget != null ? " – $" + Number(t.max_daily_budget).toLocaleString("en-US") : "+"} / day
                      {t.recommendation ? " · " + t.recommendation : ""}
                    </p>
                  </div>
                ))}
              </div>
              <FormField label="Budget optimization" description="Campaign Budget Optimization (CBO) distributes budget across ad groups automatically.">
                <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                  <option>Campaign Budget Optimization (CBO)</option>
                  <option>Ad Group Budget</option>
                </select>
              </FormField>
              <FormField label="Commitment">
                <select value={commitment} onChange={(e) => setCommitment(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                  <option>Daily</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                </select>
              </FormField>
              <FormField label="Budget amount">
                <input type="number" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} placeholder="0.00" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none" />
              </FormField>
              <FormField label="Delivery type">
                <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                  <option>Standard</option>
                  <option>Accelerated</option>
                  <option>Scheduled</option>
                </select>
              </FormField>
            </div>
          )},

          {/* Step 4: Ad Group Setup */},
          {step === 4 && (
            <div className="space-y-6">
              <FormField label="Ad group name">
                <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. AG — Summer Launch" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none" />
              </FormField>
              <div className="rounded-xl border border-neutral-100 bg-white p-5 space-y-5">
                <h3 className="text-sm font-semibold text-neutral-900">Audience</h3>
                <FormField label="Locations">
                  <input type="text" placeholder="United States, Canada…" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none" />
                </FormField>
                <FormField label="Age range">
                  <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                    <option>18–55</option><option>18–24</option><option>25–34</option><option>35–44</option><option>45–55</option><option>55+</option>
                  </select>
                </FormField>
                <FormField label="Gender">
                  <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                    <option>All</option><option>Male</option><option>Female</option><option>Non-binary</option>
                  </select>
                </FormField>
                <FormField label="Language">
                  <input type="text" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="English" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none" />
                </FormField>
              </div>
              <div className="rounded-xl border border-neutral-100 bg-white p-5 space-y-5">
                <h3 className="text-sm font-semibold text-neutral-900">Placements</h3>
                <div className="grid grid-cols-2 gap-2">
                  {placements.length === 0 && <p className="text-sm text-neutral-500">Loading placements… (none selected = automatic)</p>}
                  {placements.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input type="checkbox" className="h-4 w-4 rounded border-neutral-300" checked={pickedPlacements.has(p.key)} onChange={() => togglePlacement(p.key)} />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-100 bg-white p-5 space-y-5">
                <h3 className="text-sm font-semibold text-neutral-900">Delivery & Safety</h3>
                <FormField label="Frequency cap">
                  <input type="text" placeholder="e.g. 3 impressions per day" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none" />
                </FormField>
                <FormField label="Brand suitability">
                  <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                    <option>Standard</option><option>Limited</option><option>Maximal</option>
                  </select>
                </FormField>
              </div>
            </div>
          )},

          {/* Step 5: Ad Creation */},
          {step === 5 && (
            <div className="flex gap-6">
              <div className="w-64 rounded-xl border border-neutral-100 bg-white p-4">
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">Asset selector</h3>
                <div className="space-y-2 text-xs text-neutral-500">
                  <div className="rounded-lg border border-neutral-200 p-2">Audio files</div>
                  <div className="rounded-lg border border-neutral-200 p-2">Companion images</div>
                  <div className="rounded-lg border border-neutral-200 p-2">Logo</div>
                  <div className="rounded-lg border border-neutral-200 p-2">From Creative Library</div>
                </div>
              </div>
              <div className="flex-1 space-y-5">
                <FormField label="Ad name">
                  <input type="text" value={adName} onChange={(e) => setAdName(e.target.value)} placeholder="e.g. Summer Audio Ad 1" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none" />
                </FormField>
                <FormField label="Audio upload">
                  <div className="rounded-lg border-2 border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
                    Drag and drop audio file, or click to browse
                  </div>
                </FormField>
                <FormField label="Companion image">
                  <div className="rounded-lg border-2 border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
                    Drag and drop image, or click to browse
                  </div>
                </FormField>
                <FormField label="CTA">
                  <select value={cta} onChange={(e) => setCta(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
                    <option>Learn More</option><option>Shop Now</option><option>Sign Up</option><option>Listen Now</option><option>Download</option>
                  </select>
                </FormField>
                <FormField label="Destination URL">
                  <input type="url" value={destUrl} onChange={(e) => setDestUrl(e.target.value)} placeholder="https://" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none" />
                </FormField>
              </div>
              <div className="w-72 rounded-xl border border-neutral-100 bg-white p-4">
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">Live preview</h3>
                <div className="flex h-64 items-center justify-center rounded-lg bg-neutral-50 text-xs text-neutral-400">Ad preview</div>
              </div>
            </div>
          )},

          {/* Step 6: Review & Launch */},
          {step === 6 && (
            <div className="flex gap-6">
              <div className="flex-1 space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Review your campaign</h2>
                <div className="rounded-xl border border-neutral-100 bg-white p-5 space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-neutral-500">Objective</span><span className="font-medium text-neutral-900">{subObjective || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Campaign name</span><span className="font-medium text-neutral-900">{name || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Plan</span><span className="font-medium text-neutral-900">{tiers.find((t) => t.id === planId)?.name ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Budget</span><span className="font-medium text-neutral-900">{budgetAmount ? "$" + budgetAmount + " · " + commitment : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Delivery type</span><span className="font-medium text-neutral-900">Standard</span></div>
                </div>
              </div>
              <div className="w-72 space-y-4">
                <EstimatePanel estimates={[
                  { label: "Estimated reach", value: estimate.reach },
                  { label: "Estimated clicks", value: estimate.clicks },
                  { label: "Estimated CPM", value: estimate.cpm },
                ]} deliveryLikelihood={estimate.likelihood} />
                <PolicyPanel issues={[]} />
              </div>
            </div>
          )}
        </div>

        {/* Context panel (steps 3+) */},
        {step >= 3 && step < 6 && (
          <div className="w-72 shrink-0 space-y-4">
            <EstimatePanel estimates={[
              { label: "Estimated reach", value: estimate.reach },
              { label: "Estimated clicks", value: estimate.clicks },
              { label: "Estimated CPM", value: estimate.cpm },
            ]} deliveryLikelihood={estimate.likelihood} />
          </div>
        )}
      </div>

      {submitNote && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitNote}</div>}

      {/* Footer actions */}
      <div className="mt-8 flex items-center justify-between border-t border-neutral-200 pt-4">
        <button onClick={() => step > 0 && setStep(step - 1)} disabled={step === 0} className="text-sm font-medium text-neutral-500 disabled:opacity-30">
          Back
        </button>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => submit(false)} disabled={submitting}>Save Draft</Button>
          {step < 6 ? (
            <Button onClick={() => setStep(step + 1)}>Continue</Button>
          ) : (
            <Button onClick={() => submit(true)} disabled={submitting}>Publish Campaign</Button>
          )}
        </div>
      </div>
    </div>
  );
}
