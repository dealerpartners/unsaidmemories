"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePublishRailConfig } from "@/components/ads/rail-context";
import { useRouter } from "next/navigation";

const objectives = [
  { id: "awareness", label: "Awareness", desc: "Reach people most likely to remember your ads", icon: "eye" },
  { id: "traffic", label: "Traffic", desc: "Send people to a destination like your website or profile", icon: "arrow" },
  { id: "engagement", label: "Engagement", desc: "Get more messages, follows, or interactions", icon: "heart" },
  { id: "leads", label: "Leads", desc: "Collect leads through instant forms or messages", icon: "user" },
  { id: "conversions", label: "Conversions", desc: "Drive actions like purchases or sign-ups", icon: "target" },
  { id: "catalog", label: "Catalog Sales", desc: "Promote products from your catalog with shoppable ads", icon: "bag" },
];

const steps = ["Objective", "Details", "Budget", "Audience", "Creative"];

export default function CampaignCreatePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [objective, setObjective] = useState("");
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [budgetType, setBudgetType] = useState("daily");
  const [specialCategory, setSpecialCategory] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [placementKeys, setPlacementKeys] = useState<string[]>([]);
  usePublishRailConfig({ budgetDollars: Number(budget || 0), placementKeys, days: budgetType === "daily" ? 1 : 30, specialCategory: specialCategory || null });
  const [estimateText, setEstimateText] = useState("");
  const [note, setNote] = useState("");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    fetch("/api/ads/placements").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.placements) setPlacementKeys(d.placements.map((pl: { key: string }) => pl.key)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const b = Number(budget || 0);
    if (!(b > 0) || placementKeys.length === 0) { setEstimateText(""); return; }
    const days = budgetType === "daily" ? 1 : 30;
    const t = setTimeout(() => {
      fetch("/api/ads/estimates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget: b, days, placement_keys: placementKeys }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const imp = d?.estimate?.impressions;
          if (!imp) return;
          const fmt = (n: number) => (n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(Math.round(n)));
          setEstimateText(`~${fmt(Number(imp.low))}–${fmt(Number(imp.high))} impressions per ${budgetType === "daily" ? "day" : "campaign"}`);
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [budget, budgetType, placementKeys]);

  const publish = () => {
    setNote("");
    setPublishing(true);
    const cents = Math.round(Number(budget || 0) * 100);
    const body: Record<string, unknown> = { name: name.trim(), special_category: specialCategory || null };
    if (budgetType === "daily") body.daily_budget_cents = cents; else body.lifetime_budget_cents = cents;
    if (startsAt) body.starts_at = new Date(startsAt).toISOString();
    if (endsAt) body.ends_at = new Date(endsAt).toISOString();
    fetch("/api/ads/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "create_failed"); return d; })
      .then(async (d) => {
        const cid = d.campaign_id;
        if (cid) await fetch(`/api/ads/campaigns/${cid}/launch`, { method: "POST" }).catch(() => {});
        router.push(cid ? `/ads/campaigns/${cid}` : "/ads/campaigns");
      })
      .catch((e) => { setNote("Couldn't publish: " + String(e?.message || "unknown error")); setPublishing(false); });
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back */}
      <Link
        href="/ads"
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        Back to dashboard
      </Link>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              i < step ? "bg-[#f2eafe] text-[#6942c2]" : i === step ? "bg-neutral-200 text-neutral-900" : "bg-neutral-100 text-neutral-400"
            }`}>
              {i < step ? "✓" : i + 1}
            </div>
            <span className={`text-xs ${i === step ? "font-medium text-neutral-900" : "text-neutral-400"}`}>{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-neutral-200" />}
          </div>
        ))}
      </div>

      {/* Step 0: Objective */}
      {step === 0 && (
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900">
            Choose your campaign objective
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            This determines how your ads are optimized and what results you see.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {objectives.map((obj) => (
              <button
                key={obj.id}
                onClick={() => setObjective(obj.id)}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  objective === obj.id
                    ? "border-neutral-900 bg-neutral-50"
                    : "border-neutral-100 bg-white hover:border-neutral-300"
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  objective === obj.id ? "bg-[#f2eafe] text-[#6942c2]" : "bg-neutral-100 text-neutral-500"
                }`}>
                  <ObjectiveIcon type={obj.icon} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{obj.label}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{obj.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-8 flex justify-end">
            <button
              disabled={!objective}
              onClick={() => setStep(1)}
              className="h-10 rounded-lg bg-[#f2eafe] px-6 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc] disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Details */}
      {step === 1 && (
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900">
            Campaign details
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Name your campaign and configure basic settings.
          </p>
          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Campaign name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer Launch 2026"
                className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Special ad categories</label>
              <select value={specialCategory} onChange={(e) => setSpecialCategory(e.target.value)} className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
                <option value="">None</option>
                <option value="housing">Housing</option>
                <option value="credit">Credit</option>
                <option value="employment">Employment</option>
                <option value="social_issues">Political</option>
              </select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-neutral-100 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">Split testing</p>
                <p className="text-xs text-neutral-500">Test two ad versions against each other</p>
              </div>
              <div className="flex h-6 w-11 items-center rounded-full bg-neutral-200 p-0.5">
                <div className="h-5 w-5 rounded-full bg-white shadow-sm" />
              </div>
            </div>
          </div>
          <div className="mt-8 flex justify-between">
            <button onClick={() => setStep(0)} className="h-10 rounded-lg border border-neutral-200 px-6 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">Back</button>
            <button
              disabled={!name.trim()}
              onClick={() => setStep(2)}
              className="h-10 rounded-lg bg-[#f2eafe] px-6 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc] disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Budget */}
      {step === 2 && (
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900">
            Budget & schedule
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Set your budget and how it should be spent.
          </p>
          <div className="mt-6 space-y-4">
            <div className="flex gap-3">
              {["daily", "lifetime"].map((t) => (
                <button
                  key={t}
                  onClick={() => setBudgetType(t)}
                  className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors ${
                    budgetType === t ? "border-neutral-900 bg-neutral-50" : "border-neutral-100 hover:border-neutral-300"
                  }`}
                >
                  <p className="text-sm font-medium text-neutral-900">{t === "daily" ? "Daily budget" : "Lifetime budget"}</p>
                  <p className="text-xs text-neutral-500">{t === "daily" ? "Spend up to this amount each day" : "Total spend over campaign lifetime"}</p>
                </button>
              ))}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                {budgetType === "daily" ? "Daily budget" : "Lifetime budget"} ($)
              </label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder={budgetType === "daily" ? "50" : "1000"}
                className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Schedule</label>
              <div className="flex gap-3">
                <input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none"
                />
                <input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none"
                />
              </div>
            </div>
            {budget && Number(budget) > 0 && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-medium text-emerald-800">Estimated results</p>
                <p className="mt-1 text-sm text-emerald-700">
                  {estimateText || "Estimating…"}
                </p>
              </div>
            )}
          </div>
          <div className="mt-8 flex justify-between">
            <button onClick={() => setStep(1)} className="h-10 rounded-lg border border-neutral-200 px-6 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">Back</button>
            <button
              disabled={!budget || Number(budget) <= 0}
              onClick={() => setStep(3)}
              className="h-10 rounded-lg bg-[#f2eafe] px-6 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc] disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Audience */}
      {step === 3 && (
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900">
            Audience targeting
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Define who sees your ads by demographics, music affinity, and listening behavior.
          </p>
          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Location</label>
              <input type="text" placeholder="United States" className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Age range</label>
                <div className="flex gap-2">
                  <select className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
                    {Array.from({ length: 8 }, (_, i) => 18 + i * 5).map((a) => <option key={a}>{a}</option>)}
                  </select>
                  <span className="flex items-center text-neutral-400">–</span>
                  <select className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
                    <option>65+</option>
                    {Array.from({ length: 8 }, (_, i) => 20 + i * 5).reverse().map((a) => <option key={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Gender</label>
                <select className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
                  <option>All</option>
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Music genres</label>
              <input type="text" placeholder="Pop, Hip-Hop, R&B, Electronic..." className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Listening behavior</label>
              <select className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
                <option>All listeners</option>
                <option>Active streamers (high engagement)</option>
                <option>Playlist curators</option>
                <option>Live session participants</option>
              </select>
            </div>
          </div>
          <div className="mt-8 flex justify-between">
            <button onClick={() => setStep(2)} className="h-10 rounded-lg border border-neutral-200 px-6 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">Back</button>
            <button onClick={() => setStep(4)} className="h-10 rounded-lg bg-[#f2eafe] px-6 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc]">Continue</button>
          </div>
        </div>
      )}

      {note && step === 4 && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{note}</div>}

      {/* Step 4: Creative */}
      {step === 4 && (
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900">
            Ad creative
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Upload or create your ad content. You can add more creatives later.
          </p>
          <div className="mt-6 space-y-4">
            <div className="flex gap-3">
              {["Audio", "Display", "Video"].map((fmt) => (
                <div
                  key={fmt}
                  className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 py-8 text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-600"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  <p className="text-xs font-medium">{fmt}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-neutral-100 px-4 py-3">
              <p className="text-sm font-medium text-neutral-900">Or generate with AI</p>
              <p className="mt-0.5 text-xs text-neutral-500">Create scripts, voiceovers, and templates automatically</p>
              <button className="mt-3 h-9 rounded-lg bg-neutral-100 px-4 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-200">
                Open Creative Generator
              </button>
            </div>
          </div>
          <div className="mt-8 flex justify-between">
            <button onClick={() => setStep(3)} className="h-10 rounded-lg border border-neutral-200 px-6 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">Back</button>
            <button
              onClick={publish}
              disabled={publishing}
              className="h-10 rounded-lg bg-[#f2eafe] px-6 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc] disabled:opacity-50"
            >
              Publish campaign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ObjectiveIcon({ type }: { type: string }) {
  const props = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "eye":
      return <svg {...props}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "arrow":
      return <svg {...props}><path d="M5 12h14M12 5l7 7-7 7" /></svg>;
    case "heart":
      return <svg {...props}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
    case "user":
      return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "target":
      return <svg {...props}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
    case "bag":
      return <svg {...props}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>;
    default:
      return null;
  }
}
