"use client";

// Shared client helpers for the wired Ad Center pages (BL-5). Every
// page in the closure set reads through these so the portal speaks to
// the real /api/ads/* contracts in exactly one dialect — no page keeps
// its own mock arrays or invented formatting.

export interface CampaignRow {
  id: string;
  name: string;
  // Ads v2 lifecycle: draft | scheduled | preflight | approved |
  // active | paused | ended.
  status: string;
  // The delivery tier's display name under Ads v2 (the column the
  // list labels "Tier"); legacy objective labels no longer exist.
  objective: string;
  delivery_goal: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  spent: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  creative_count?: number;
  group_count?: number;
  impressions_today?: number;
}

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  leads?: number;
}

export interface AnalyticsData {
  totals: CampaignMetrics & { ctr: number; cpa: number; reach?: number };
  byCampaign: Array<CampaignMetrics & {
    id: string; name: string; status: string; objective: string; leads: number; reach?: number;
  }>;
  byPlacement: Array<{
    placement: string; impressions: number; clicks: number; spend: number;
  }>;
}

export const OBJECTIVE_LABELS: Record<string, string> = {
  brand_awareness: "Brand Awareness",
  traffic: "Traffic",
  engagement: "Engagement",
  lead_generation: "Lead Generation",
  app_installs: "App Promotion",
  sales: "Sales",
};

export function money(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function count(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString("en-US");
}

export function budgetLabel(c: CampaignRow): string {
  if (c.daily_budget) return `${money(c.daily_budget)}/day`;
  if (c.lifetime_budget) return `${money(c.lifetime_budget)} lifetime`;
  return "—";
}

export function dateRangeLabel(c: CampaignRow): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (c.start_date && c.end_date) return `${fmt(c.start_date)} – ${fmt(c.end_date)}`;
  if (c.start_date) return `From ${fmt(c.start_date)}`;
  if (c.end_date) return `Until ${fmt(c.end_date)}`;
  return "Not set";
}

export function resultsLabel(m: CampaignMetrics | undefined, objective: string): string {
  if (!m) return "—";
  if (objective === "lead_generation") return `${count(m.leads ?? m.conversions)} leads`;
  if (objective === "sales" || objective === "engagement") return `${count(m.conversions)} conversions`;
  if (objective === "brand_awareness") return `${count(m.impressions)} impressions`;
  return `${count(m.clicks)} clicks`;
}

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? `request_failed_${res.status}`);
  }
  return res.json();
}

interface CampaignApiRow {
  id: string;
  name: string;
  status: string;
  tier_code?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  daily_budget_cents?: string | number | null;
  lifetime_budget_cents?: string | number | null;
  lifetime_spend_cents?: string | number | null;
  impressions_today?: string | number | null;
  creative_count?: number;
  group_count?: number;
  created_at: string;
}

const TIER_LABELS: Record<string, string> = {
  platinum: "Platinum",
  gold: "Gold",
  silver: "Silver",
  house: "House",
};

export async function fetchCampaigns(): Promise<CampaignRow[]> {
  const res = await fetch("/api/ads/campaigns");
  const data = await jsonOrThrow(res);
  const rows = (data.campaigns ?? []) as CampaignApiRow[];
  const cents = (v: string | number | null | undefined) =>
    v == null ? null : Number(v) / 100;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    objective: TIER_LABELS[r.tier_code ?? ""] ?? r.tier_code ?? "",
    delivery_goal: null,
    daily_budget: cents(r.daily_budget_cents) || null,
    lifetime_budget: cents(r.lifetime_budget_cents) || null,
    spent: cents(r.lifetime_spend_cents),
    start_date: r.starts_at ?? null,
    end_date: r.ends_at ?? null,
    created_at: r.created_at,
    creative_count: r.creative_count,
    group_count: r.group_count,
    impressions_today: r.impressions_today == null ? 0 : Number(r.impressions_today),
  }));
}

export async function fetchAnalytics(): Promise<AnalyticsData> {
  const res = await fetch("/api/ads/analytics");
  return (await jsonOrThrow(res)) as AnalyticsData;
}

export async function fetchCampaignDetail(id: string) {
  const res = await fetch(`/api/ads/campaigns/${id}`);
  return jsonOrThrow(res);
}

export async function patchCampaign(id: string, body: Record<string, unknown>) {
  // Ads v2 lifecycle verbs have their own routes: pause is its own
  // endpoint, and "resume" is the launch endpoint's paused branch.
  // Everything else (fields, owner-driven status moves) is a PATCH.
  if (body.status === "paused") {
    const res = await fetch(`/api/ads/campaigns/${id}/pause`, { method: "POST" });
    return jsonOrThrow(res);
  }
  if (body.status === "active") {
    const res = await fetch(`/api/ads/campaigns/${id}/launch`, { method: "POST" });
    return jsonOrThrow(res);
  }
  const res = await fetch(`/api/ads/campaigns/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function deleteCampaign(id: string) {
  const res = await fetch(`/api/ads/campaigns/${id}`, { method: "DELETE" });
  return jsonOrThrow(res);
}

export async function duplicateCampaign(id: string): Promise<string> {
  const res = await fetch(`/api/ads/campaigns/${id}/duplicate`, { method: "POST" });
  const data = await jsonOrThrow(res);
  return data.campaign_id as string;
}
