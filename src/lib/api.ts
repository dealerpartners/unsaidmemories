/**
 * Musicosy Ad Center — API Client
 *
 * Frontend API stubs for easy connection to the backend.
 * Each function returns typed data and can be swapped from
 * mock data to real fetch calls by changing the BASE_URL.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const IS_MOCK = !BASE_URL;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  if (IS_MOCK) {
    return mockFetch<T>(path, options);
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API ${status}: ${body}`);
  }
}

/* ─── Types ─── */

export interface Campaign {
  id: string;
  name: string;
  status: "active" | "paused" | "draft" | "completed" | "pending_review" | "rejected";
  objective: string;
  budget: { type: "daily" | "lifetime"; amount: number; currency: string };
  spend: number;
  results: number;
  resultsLabel: string;
  startDate: string;
  endDate: string;
}

export interface AdGroup {
  id: string;
  campaignId: string;
  name: string;
  status: Campaign["status"];
  budget: number;
  optimizationGoal: string;
  spend: number;
  results: number;
}

export interface Ad {
  id: string;
  adGroupId: string;
  name: string;
  status: Campaign["status"];
  type: "audio" | "video" | "image" | "carousel";
  creativeId: string;
  spend: number;
  results: number;
}

export interface Audience {
  id: string;
  name: string;
  type: "custom" | "lookalike" | "demographic" | "artist_affinity" | "exclusion";
  size: number;
  status: "ready" | "building" | "expired";
  updatedAt: string;
}

export interface Creative {
  id: string;
  name: string;
  type: "audio" | "image" | "video";
  size: string;
  status: "approved" | "in_review" | "rejected";
  url: string;
  updatedAt: string;
  tags: string[];
}

export interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  source: "instant_form" | "direct_message" | "website_form";
  campaignId: string;
  status: "new" | "contacted" | "qualified" | "disqualified";
  value: number;
  createdAt: string;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "overdue";
  dueDate: string;
}

export interface BillingTransaction {
  id: string;
  type: "charge" | "refund" | "credit";
  amount: number;
  currency: string;
  date: string;
  status: "completed" | "pending" | "failed";
}

export interface KPI {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpa: number;
  roas: number;
  conversions: number;
}

/* ─── Campaign API ─── */

export const campaignsApi = {
  list: (params?: { status?: string; search?: string }) =>
    apiFetch<Campaign[]>("/api/campaigns" + qs(params)),

  get: (id: string) =>
    apiFetch<Campaign>(`/api/campaigns/${id}`),

  create: (data: Partial<Campaign>) =>
    apiFetch<Campaign>("/api/campaigns", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: Partial<Campaign>) =>
    apiFetch<Campaign>(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  pause: (id: string) =>
    apiFetch<Campaign>(`/api/campaigns/${id}/pause`, { method: "POST" }),

  resume: (id: string) =>
    apiFetch<Campaign>(`/api/campaigns/${id}/resume`, { method: "POST" }),

  duplicate: (id: string) =>
    apiFetch<Campaign>(`/api/campaigns/${id}/duplicate`, { method: "POST" }),

  delete: (id: string) =>
    apiFetch<void>(`/api/campaigns/${id}`, { method: "DELETE" }),
};

/* ─── Ad Group API ─── */

export const adGroupsApi = {
  list: (campaignId?: string) =>
    apiFetch<AdGroup[]>("/api/ad-groups" + qs({ campaignId })),

  get: (id: string) =>
    apiFetch<AdGroup>(`/api/ad-groups/${id}`),

  create: (data: Partial<AdGroup>) =>
    apiFetch<AdGroup>("/api/ad-groups", { method: "POST", body: JSON.stringify(data) }),
};

/* ─── Ad API ─── */

export const adsApi = {
  list: (adGroupId?: string) =>
    apiFetch<Ad[]>("/api/ads" + qs({ adGroupId })),

  get: (id: string) =>
    apiFetch<Ad>(`/api/ads/${id}`),

  create: (data: Partial<Ad>) =>
    apiFetch<Ad>("/api/ads", { method: "POST", body: JSON.stringify(data) }),
};

/* ─── Audience API ─── */

export const audiencesApi = {
  list: () => apiFetch<Audience[]>("/api/audiences"),

  get: (id: string) => apiFetch<Audience>(`/api/audiences/${id}`),

  create: (data: Partial<Audience>) =>
    apiFetch<Audience>("/api/audiences", { method: "POST", body: JSON.stringify(data) }),

  delete: (id: string) =>
    apiFetch<void>(`/api/audiences/${id}`, { method: "DELETE" }),
};

/* ─── Creative API ─── */

export const creativesApi = {
  list: () => apiFetch<Creative[]>("/api/creatives"),

  get: (id: string) => apiFetch<Creative>(`/api/creatives/${id}`),

  upload: (formData: FormData) =>
    apiFetch<Creative>("/api/creatives/upload", {
      method: "POST",
      headers: {}, // let browser set Content-Type for multipart
      body: formData,
    }),

  delete: (id: string) =>
    apiFetch<void>(`/api/creatives/${id}`, { method: "DELETE" }),
};

/* ─── Leads API ─── */

export const leadsApi = {
  list: (params?: { status?: string; source?: string }) =>
    apiFetch<Lead[]>("/api/leads" + qs(params)),

  get: (id: string) => apiFetch<Lead>(`/api/leads/${id}`),

  update: (id: string, data: Partial<Lead>) =>
    apiFetch<Lead>(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  exportCsv: () => apiFetch<Blob>("/api/leads/export"),
};

/* ─── Billing API ─── */

export const billingApi = {
  kpi: () => apiFetch<{ balance: number; currentSpend: number; nextInvoiceDate: string; paymentMethod: string }>("/api/billing/kpi"),

  invoices: () => apiFetch<Invoice[]>("/api/billing/invoices"),

  transactions: () => apiFetch<BillingTransaction[]>("/api/billing/transactions"),

  addPaymentMethod: (data: { cardNumber: string; expiry: string; cvc: string }) =>
    apiFetch<void>("/api/billing/payment-methods", { method: "POST", body: JSON.stringify(data) }),
};

/* ─── Analytics API ─── */

export const analyticsApi = {
  kpi: (campaignId?: string) => apiFetch<KPI>("/api/analytics/kpi" + qs({ campaignId })),

  trend: (params?: { metric?: string; granularity?: string }) =>
    apiFetch<{ date: string; value: number }[]>("/api/analytics/trend" + qs(params)),

  breakdown: (params?: { by: string }) =>
    apiFetch<Record<string, KPI>>("/api/analytics/breakdown" + qs(params)),
};

/* ─── Auth API ─── */

export interface AuthSession {
  user: CurrentUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: "owner" | "admin" | "editor" | "viewer";
  accountId: string;
  accountName: string;
  plan: {
    tier: "starter" | "medium" | "pro" | "enterprise";
    label: string;
    status: "active" | "trial" | "past_due" | "canceled";
  };
  permissions: string[];
  lastLoginAt: string;
}

export const authApi = {
  /** Sign in with email/password — returns session tokens */
  login: (data: { email: string; password: string }) =>
    apiFetch<AuthSession>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Sign out — invalidates server session */
  logout: () =>
    apiFetch<void>("/api/auth/logout", { method: "POST" }),

  /** Get current authenticated user */
  me: () =>
    apiFetch<CurrentUser>("/api/auth/me"),

  /** Refresh the access token */
  refresh: (refreshToken: string) =>
    apiFetch<{ accessToken: string; expiresAt: string }>("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  /** Request a password reset email */
  forgotPassword: (email: string) =>
    apiFetch<void>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  /** Reset password with token */
  resetPassword: (data: { token: string; password: string }) =>
    apiFetch<void>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Switch active account (for multi-account users) */
  switchAccount: (accountId: string) =>
    apiFetch<AuthSession>("/api/auth/switch-account", {
      method: "POST",
      body: JSON.stringify({ accountId }),
    }),
};

/* ─── Account API ─── */

export interface Account {
  id: string;
  name: string;
  type: "advertiser" | "agency" | "business";
  status: "active" | "suspended" | "pending_verification";
  currency: string;
  timezone: string;
  createdAt: string;
}

export const accountsApi = {
  list: () => apiFetch<Account[]>("/api/accounts"),
  get: (id: string) => apiFetch<Account>(`/api/accounts/${id}`),
  update: (id: string, data: Partial<Account>) =>
    apiFetch<Account>(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
};

/* ─── Team API ─── */

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
  status: "active" | "pending" | "revoked";
  lastActiveAt: string;
  permissions: string[];
}

export const teamApi = {
  list: () => apiFetch<TeamMember[]>("/api/team"),
  get: (id: string) => apiFetch<TeamMember>(`/api/team/${id}`),
  invite: (data: { email: string; role: string }) =>
    apiFetch<TeamMember>("/api/team/invite", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id: string, role: string) =>
    apiFetch<TeamMember>(`/api/team/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  revoke: (id: string) =>
    apiFetch<void>(`/api/team/${id}`, { method: "DELETE" }),
};

/* ─── Webhooks / Crons / Triggers API ─── */

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: "active" | "disabled" | "failing";
  secret: string;
  createdAt: string;
  lastDeliveryAt?: string;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  action: string;
  status: "active" | "paused" | "error";
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface Trigger {
  id: string;
  name: string;
  event: string;
  conditions: Record<string, any>;
  action: string;
  status: "active" | "paused";
}

export const webhooksApi = {
  list: () => apiFetch<Webhook[]>("/api/webhooks"),
  create: (data: Partial<Webhook>) =>
    apiFetch<Webhook>("/api/webhooks", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Webhook>) =>
    apiFetch<Webhook>(`/api/webhooks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<void>(`/api/webhooks/${id}`, { method: "DELETE" }),
  test: (id: string) =>
    apiFetch<{ success: boolean; response: string }>(`/api/webhooks/${id}/test`, { method: "POST" }),
};

export const cronsApi = {
  list: () => apiFetch<CronJob[]>("/api/crons"),
  create: (data: Partial<CronJob>) =>
    apiFetch<CronJob>("/api/crons", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CronJob>) =>
    apiFetch<CronJob>(`/api/crons/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  pause: (id: string) =>
    apiFetch<CronJob>(`/api/crons/${id}/pause`, { method: "POST" }),
  resume: (id: string) =>
    apiFetch<CronJob>(`/api/crons/${id}/resume`, { method: "POST" }),
  delete: (id: string) =>
    apiFetch<void>(`/api/crons/${id}`, { method: "DELETE" }),
};

export const triggersApi = {
  list: () => apiFetch<Trigger[]>("/api/triggers"),
  create: (data: Partial<Trigger>) =>
    apiFetch<Trigger>("/api/triggers", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Trigger>) =>
    apiFetch<Trigger>(`/api/triggers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<void>(`/api/triggers/${id}`, { method: "DELETE" }),
};

/* ─── Helpers ─── */

function qs(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][];
  if (!entries.length) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

/* ─── Mock Data ─── */

async function mockFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 100));

  if (path.startsWith("/api/campaigns") && !path.split("/")[3]) {
    return mockCampaigns() as T;
  }
  if (path.startsWith("/api/audiences")) {
    return mockAudiences() as T;
  }
  if (path.startsWith("/api/creatives")) {
    return mockCreatives() as T;
  }
  if (path.startsWith("/api/leads")) {
    return mockLeads() as T;
  }
  if (path.startsWith("/api/analytics/kpi")) {
    return mockKpi() as T;
  }
  if (path.startsWith("/api/billing/kpi")) {
    return mockBillingKpi() as T;
  }
  // Default empty response
  return [] as T;
}

function mockCampaigns(): Campaign[] {
  return [
    { id: "1", name: "Summer Launch 2026", status: "active", objective: "Conversions", budget: { type: "daily", amount: 100, currency: "USD" }, spend: 2450, results: 1230, resultsLabel: "1,230 clicks", startDate: "2026-07-15", endDate: "2026-08-12" },
    { id: "2", name: "Brand Awareness Push", status: "active", objective: "Awareness", budget: { type: "daily", amount: 30, currency: "USD" }, spend: 890, results: 45000, resultsLabel: "45K impressions", startDate: "2026-08-01", endDate: "2026-08-31" },
    { id: "3", name: "Catalog Carousel Test", status: "paused", objective: "Conversions", budget: { type: "daily", amount: 20, currency: "USD" }, spend: 340, results: 89, resultsLabel: "89 clicks", startDate: "2026-06-20", endDate: "2026-07-05" },
  ];
}

function mockAudiences(): Audience[] {
  return [
    { id: "1", name: "Broad US 18-55", type: "demographic", size: 42000000, status: "ready", updatedAt: "2026-08-10" },
    { id: "2", name: "Custom — Past Purchasers", type: "custom", size: 12000, status: "ready", updatedAt: "2026-08-08" },
    { id: "3", name: "Lookalike — Purchasers 1%", type: "lookalike", size: 2100000, status: "ready", updatedAt: "2026-08-05" },
  ];
}

function mockCreatives(): Creative[] {
  return [
    { id: "1", name: "Summer Hero Image", type: "image", size: "1200×628", status: "approved", url: "", updatedAt: "2026-08-10", tags: ["summer", "hero"] },
    { id: "2", name: "Brand Audio 30s", type: "audio", size: "30s", status: "approved", url: "", updatedAt: "2026-08-08", tags: ["brand", "audio"] },
  ];
}

function mockLeads(): Lead[] {
  return [
    { id: "1", name: "Sarah Chen", email: "sarah@example.com", source: "instant_form", campaignId: "1", status: "new", value: 120, createdAt: "2026-08-12" },
    { id: "2", name: "Marcus Johnson", email: "marcus@example.com", source: "direct_message", campaignId: "2", status: "contacted", value: 85, createdAt: "2026-08-11" },
  ];
}

function mockKpi(): KPI {
  return { spend: 3680, impressions: 142000, clicks: 1824, ctr: 1.28, cpa: 19.78, roas: 3.4, conversions: 186 };
}

function mockBillingKpi() {
  return { balance: 4320, currentSpend: 3680, nextInvoiceDate: "2026-08-15", paymentMethod: "Visa ····4242" };
}
