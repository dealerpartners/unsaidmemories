import { createServerClient } from "@/lib/supabase";
import { tenantConfigured } from "@/lib/tenant";

/**
 * System health probes — every check performs the real operation it
 * claims to measure (a database read, an auth listing, a bucket list, an
 * HTTP fetch of the storefront). Env checks report presence only; no
 * credential value is ever read into a response beyond its mode prefix
 * (Stripe test vs live), which is how the dashboard tells sandbox apart.
 */

export interface HealthCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

function envPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = Date.now();
  const value = await fn();
  return { ms: Date.now() - start, value };
}

export async function runHealthChecks(origin: string | null): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  const db = createServerClient();

  // Database
  try {
    const { ms } = await timed(async () => {
      const { error } = await db.from("tenants").select("id").limit(1);
      if (error) throw new Error(error.message);
    });
    checks.push({ id: "database", label: "API & Database Health", status: ms < 1500 ? "ok" : "warn", detail: `PostgREST round-trip ${ms}ms` });
  } catch (e) {
    checks.push({ id: "database", label: "API & Database Health", status: "fail", detail: e instanceof Error ? e.message : "Unreachable" });
  }

  // Tenant resolution
  checks.push({
    id: "tenant",
    label: "Tenant Resolution",
    status: tenantConfigured() ? "ok" : "fail",
    detail: tenantConfigured() ? "SUPABASE_TENANT_ID set — single resolver path (src/lib/tenant.ts)" : "SUPABASE_TENANT_ID missing — tenant-scoped routes will throw",
  });

  // Auth
  try {
    const { ms, value } = await timed(() => db.auth.admin.listUsers({ page: 1, perPage: 1 }));
    if (value.error) throw new Error(value.error.message);
    checks.push({ id: "auth", label: "Authentication Health", status: "ok", detail: `Auth admin API responding (${ms}ms)` });
  } catch (e) {
    checks.push({ id: "auth", label: "Authentication Health", status: "fail", detail: e instanceof Error ? e.message : "Auth unreachable" });
  }

  // Storage
  try {
    const { data, error } = await db.storage.listBuckets();
    if (error) throw new Error(error.message);
    checks.push({
      id: "storage",
      label: "File Storage (Supabase)",
      status: data.length > 0 ? "ok" : "warn",
      detail: data.length > 0 ? `${data.length} bucket(s): ${data.map((b) => b.name).join(", ")}` : "No storage buckets exist yet — design/print files have nowhere to land",
    });
  } catch (e) {
    checks.push({ id: "storage", label: "File Storage (Supabase)", status: "fail", detail: e instanceof Error ? e.message : "Storage unreachable" });
  }

  // Website
  if (origin) {
    try {
      const res = await fetch(origin + "/", { method: "HEAD", signal: AbortSignal.timeout(8000) });
      checks.push({ id: "website", label: "Website Status", status: res.status < 500 ? "ok" : "fail", detail: `Storefront responded HTTP ${res.status}` });
    } catch (e) {
      checks.push({ id: "website", label: "Website Status", status: "warn", detail: e instanceof Error ? e.message : "Storefront fetch failed" });
    }
  }

  // Payments
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  checks.push({
    id: "payments",
    label: "Payment Service (Stripe)",
    status: stripeKey ? (envPresent("STRIPE_WEBHOOK_SECRET") ? "ok" : "warn") : "fail",
    detail: !stripeKey
      ? "STRIPE_SECRET_KEY not set"
      : `${stripeKey.startsWith("sk_test") ? "Sandbox (test) keys" : stripeKey.startsWith("sk_live") ? "LIVE keys" : "Key set"}${envPresent("STRIPE_WEBHOOK_SECRET") ? "; webhook secret set" : "; STRIPE_WEBHOOK_SECRET missing — webhook signature verification falls back to unauthenticated parsing"}`,
  });

  // Email
  checks.push({
    id: "email",
    label: "Email Service (Resend)",
    status: envPresent("RESEND_API_KEY") ? "ok" : "fail",
    detail: envPresent("RESEND_API_KEY") ? "RESEND_API_KEY set" : "RESEND_API_KEY not set — transactional email cannot send",
  });

  // Search
  checks.push({
    id: "search",
    label: "Search (Algolia)",
    status: envPresent("ALGOLIA_APP_ID") && envPresent("ALGOLIA_WRITE_API_KEY") ? "ok" : "warn",
    detail: envPresent("ALGOLIA_APP_ID") ? "Algolia app configured" : "Algolia not configured — catalog search runs on the database",
  });

  // Supplier ordering
  try {
    const { data } = await db.from("suppliers").select("name, ordering_status").order("name");
    const live = (data ?? []).filter((s) => s.ordering_status === "live" || s.ordering_status === "active");
    checks.push({
      id: "suppliers",
      label: "Supplier Ordering",
      status: (data ?? []).length === 0 ? "warn" : "ok",
      detail: `${(data ?? []).length} suppliers registered; ordering live: ${live.length ? live.map((s) => s.name).join(", ") : "none"}`,
    });
  } catch {
    checks.push({ id: "suppliers", label: "Supplier Ordering", status: "warn", detail: "Suppliers table unreadable" });
  }

  return checks;
}
