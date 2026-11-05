"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, FormField } from "@/components/ads/v2-ui";

// Account settings documents (ad_account_settings via /api/ads/settings).
// One form component, one `kind` per surface:
//   targeting_defaults — Z2 default targeting controls
//   marketing          — 2.6 marketing settings
//   branding           — 2.7 branding settings
//   notifications      — AC4 notification preferences
//   companion          — Z7 companion behavior
// Every field saves into the account's real settings document; a fresh
// account starts from the defaults shown and the form says so.

export type SettingsKind = "targeting_defaults" | "marketing" | "branding" | "notifications" | "companion";

const inputCls =
  "w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none";

const DEFAULTS: Record<SettingsKind, Record<string, unknown>> = {
  targeting_defaults: { locations: [], languages: [], devices: [], age_range: "", gender: "" },
  marketing: { default_objective: "traffic", default_cta: "Learn more", landing_domain: "", utm_source: "unsaid", utm_medium: "ads" },
  branding: { brand_name: "", logo_url: "", primary_color: "#0E6D69", accent_color: "#F97316", suitability: "standard" },
  notifications: { billing: true, delivery_alerts: true, verification: true, weekly_summary: false },
  companion: { enabled: true, require_companion_for_audio: false, fallback_image_url: "" },
};

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 text-sm text-neutral-700">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
    </label>
  );
}

export function AccountSettingsForm({ kind }: { kind: SettingsKind }) {
  const [doc, setDoc] = useState<Record<string, unknown>>(DEFAULTS[kind]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ads/settings?kind=${kind}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "load_failed");
      setDoc({ ...DEFAULTS[kind], ...(data.settings ?? {}) });
    } catch {
      setError("We couldn't load these settings.");
    } finally {
      setLoaded(true);
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: string, value: unknown) => setDoc((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/ads/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, settings: doc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save_failed");
      setNotice("Settings saved to your ad account.");
    } catch {
      setError("The settings couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="text-sm text-neutral-400">Loading settings…</p>;

  return (
    <div className="max-w-xl rounded-xl border border-neutral-200 bg-white p-5">
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      <div className="space-y-4">
        {kind === "targeting_defaults" && (
          <>
            <FormField label="Default locations (comma separated)" description="Pre-filled into new audiences and campaigns. Serve evaluates these per viewer.">
              <input className={inputCls} value={((doc.locations as string[]) ?? []).join(", ")} onChange={(e) => set("locations", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="Memphis, Nashville" />
            </FormField>
            <FormField label="Default languages (comma separated)">
              <input className={inputCls} value={((doc.languages as string[]) ?? []).join(", ")} onChange={(e) => set("languages", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="en" />
            </FormField>
            <FormField label="Default devices">
              <div className="flex gap-4">
                {["mobile", "tablet", "desktop"].map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={((doc.devices as string[]) ?? []).includes(d)}
                      onChange={(e) => {
                        const cur = (doc.devices as string[]) ?? [];
                        set("devices", e.target.checked ? [...cur, d] : cur.filter((x) => x !== d));
                      }}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </FormField>
            <FormField label="Default age range">
              <input className={inputCls} value={String(doc.age_range ?? "")} onChange={(e) => set("age_range", e.target.value)} placeholder="25-54" />
            </FormField>
            <FormField label="Default gender">
              <select className={inputCls} value={String(doc.gender ?? "")} onChange={(e) => set("gender", e.target.value)}>
                <option value="">All</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </FormField>
            <p className="text-xs text-neutral-400">
              Stored as one targeting document in the same shape campaign creation and serve read.
            </p>
          </>
        )}
        {kind === "marketing" && (
          <>
            <FormField label="Default campaign objective">
              <select className={inputCls} value={String(doc.default_objective ?? "traffic")} onChange={(e) => set("default_objective", e.target.value)}>
                {["brand_awareness", "traffic", "engagement", "lead_generation", "app_installs", "sales"].map((o) => (
                  <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Default call to action">
              <input className={inputCls} value={String(doc.default_cta ?? "")} onChange={(e) => set("default_cta", e.target.value)} />
            </FormField>
            <FormField label="Landing domain" description="The domain your campaign destination URLs normally point at.">
              <input className={inputCls} value={String(doc.landing_domain ?? "")} onChange={(e) => set("landing_domain", e.target.value)} placeholder="unsaidmemories.com" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="UTM source">
                <input className={inputCls} value={String(doc.utm_source ?? "")} onChange={(e) => set("utm_source", e.target.value)} />
              </FormField>
              <FormField label="UTM medium">
                <input className={inputCls} value={String(doc.utm_medium ?? "")} onChange={(e) => set("utm_medium", e.target.value)} />
              </FormField>
            </div>
          </>
        )}
        {kind === "branding" && (
          <>
            <FormField label="Brand name shown on ads">
              <input className={inputCls} value={String(doc.brand_name ?? "")} onChange={(e) => set("brand_name", e.target.value)} placeholder="UnSaid Memories" />
            </FormField>
            <FormField label="Logo URL">
              <input className={inputCls} value={String(doc.logo_url ?? "")} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Primary color">
                <input className={inputCls} type="color" value={String(doc.primary_color ?? "#0E6D69")} onChange={(e) => set("primary_color", e.target.value)} />
              </FormField>
              <FormField label="Accent color">
                <input className={inputCls} type="color" value={String(doc.accent_color ?? "#F97316")} onChange={(e) => set("accent_color", e.target.value)} />
              </FormField>
            </div>
            <FormField label="Brand suitability" description="The account-level floor; campaigns can tighten it, never loosen it.">
              <select className={inputCls} value={String(doc.suitability ?? "standard")} onChange={(e) => set("suitability", e.target.value)}>
                <option value="standard">Standard</option>
                <option value="limited">Limited</option>
                <option value="expanded">Expanded</option>
              </select>
            </FormField>
          </>
        )}
        {kind === "notifications" && (
          <>
            <Toggle label="Billing events (charges, failed payments)" value={doc.billing === true} onChange={(v) => set("billing", v)} />
            <Toggle label="Delivery alerts (budget exhausted, campaign ended)" value={doc.delivery_alerts === true} onChange={(v) => set("delivery_alerts", v)} />
            <Toggle label="Verification updates" value={doc.verification === true} onChange={(v) => set("verification", v)} />
            <Toggle label="Weekly performance summary" value={doc.weekly_summary === true} onChange={(v) => set("weekly_summary", v)} />
            <p className="text-xs text-neutral-400">Preferences decide which event types land in your notification inbox.</p>
          </>
        )}
        {kind === "companion" && (
          <>
            <Toggle label="Companion images enabled" value={doc.enabled === true} onChange={(v) => set("enabled", v)} />
            <Toggle label="Require a companion image on every audio ad" value={doc.require_companion_for_audio === true} onChange={(v) => set("require_companion_for_audio", v)} />
            <FormField label="Fallback companion image URL" description="Shown when an audio creative has no companion of its own.">
              <input className={inputCls} value={String(doc.fallback_image_url ?? "")} onChange={(e) => set("fallback_image_url", e.target.value)} placeholder="https://…" />
            </FormField>
          </>
        )}
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
