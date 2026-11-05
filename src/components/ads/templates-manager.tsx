"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, EmptyState, Button, FormField } from "@/components/ads/v2-ui";
import { OBJECTIVE_LABELS } from "@/components/ads/ads-data";

// Campaign Launch Templates (W5) — real templates over
// ad_campaign_templates. A template stores a campaign-create payload;
// "Launch from template" posts it to /api/ads/campaigns (the one write
// path) and lands on the new campaign. Saving a template captures the
// shape — objective, budgets, placements, targeting — not a picture
// of a page.

interface Template {
  id: string;
  name: string;
  category: string | null;
  objective: string;
  template: Record<string, unknown>;
  created_at: string;
}

const inputCls =
  "w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none";

export function TemplatesManager() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", category: "", objective: "traffic", daily_budget: 25 });
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ads/templates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "load_failed");
      setTemplates(data.templates ?? []);
    } catch {
      setError("We couldn't load your templates.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/ads/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category || null,
          objective: form.objective,
          template: {
            objective: form.objective,
            daily_budget: form.daily_budget,
            delivery_type: "standard",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create_failed");
      setNotice("Template saved. Launching from it creates a draft campaign you can finish in the wizard's shape.");
      setForm({ ...form, name: "" });
      load();
    } catch {
      setError("The template couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };

  const launch = async (t: Template) => {
    setLaunching(t.id);
    setError("");
    try {
      const res = await fetch("/api/ads/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(t.template ?? {}),
          name: `${t.name} — launch`,
          objective: t.objective,
          status: "draft",
          creative: { headline: t.name },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "launch_failed");
      router.push(`/ads/campaigns/${data.campaign_id}`);
    } catch {
      setError("Launching from this template failed — its saved shape may predate a required field.");
      setLaunching("");
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/ads/templates?id=${id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  };

  return (
    <div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">New template</h2>
          <div className="space-y-4">
            <FormField label="Template name">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Weekend grooming offer" />
            </FormField>
            <FormField label="Category">
              <input className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Seasonal" />
            </FormField>
            <FormField label="Objective">
              <select className={inputCls} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })}>
                {Object.entries(OBJECTIVE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Daily budget ($) stored in the template">
              <input className={inputCls} type="number" min={1} value={form.daily_budget} onChange={(e) => setForm({ ...form, daily_budget: Number(e.target.value) })} />
            </FormField>
            <Button onClick={create} disabled={saving || !form.name}>
              {saving ? "Saving…" : "Save template"}
            </Button>
          </div>
        </div>
        <div>
          {templates.length === 0 ? (
            <EmptyState
              title="No launch templates yet"
              description="Templates capture a campaign shape you launch repeatedly. Save the first one on the left."
            />
          ) : (
            <DataTable
              columns={[
                { key: "name", label: "Template", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
                { key: "category", label: "Category", render: (v: string | null) => v ?? "—" },
                { key: "objective", label: "Objective", render: (v: string) => OBJECTIVE_LABELS[v] ?? v },
                {
                  key: "actions",
                  label: "",
                  render: (_: unknown, row: Template) => (
                    <span className="flex gap-2">
                      <button className="text-xs font-medium text-emerald-600 hover:underline" onClick={() => launch(row)} disabled={launching === row.id}>
                        {launching === row.id ? "Launching…" : "Launch campaign"}
                      </button>
                      <button className="text-xs font-medium text-red-500 hover:underline" onClick={() => remove(row.id)}>Delete</button>
                    </span>
                  ),
                },
              ]}
              data={templates}
            />
          )}
        </div>
      </div>
    </div>
  );
}
