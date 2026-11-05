import Link from "next/link";
import { getAdminContext } from "@/lib/admin/gate";
import { getTenantRow } from "@/lib/admin/data";
import { runHealthChecks } from "@/lib/admin/health";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { PageHead, Kpi, StaffDenied } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "/admin/system/organization", title: "Organization", desc: "Business profile, contact, timezone, currency." },
  { href: "/admin/system/locations", title: "Locations & Branches", desc: "Fulfillment centers and branch locations." },
  { href: "/admin/system/brand", title: "Brand & Identity", desc: "Logo, wordmark and brand colors." },
  { href: "/admin/users", title: "Users & Access", desc: "Staff accounts, roles and the permissions matrix." },
  { href: "/admin/system/operations", title: "Operations Settings", desc: "Fulfillment defaults, SLA and shipping profiles." },
  { href: "/admin/system/documents", title: "Document Center", desc: "Guides, policies and disclaimers." },
  { href: "/admin/system/financial-settings", title: "Financial Settings", desc: "Currencies, payment and deposit/refund policies." },
  { href: "/admin/system/integrations", title: "Integrations", desc: "Stripe, email, search and the print suppliers." },
  { href: "/admin/system/health", title: "System Health", desc: "Live status of every connected service." },
  { href: "/admin/system/audit", title: "Audit & Data Governance", desc: "Audit log, retention and deletion requests." },
  { href: "/admin/system/security", title: "Security & 2FA", desc: "Two-factor status, sign-ins and impersonation." },
];

const QUICK_LINKS = [
  { href: "/", label: "View Public Website", external: false },
  { href: "/login", label: "Customer Portal Login", external: false },
  { href: "https://dashboard.stripe.com", label: "Stripe Dashboard", external: true },
  { href: "/help", label: "Help Center", external: false },
  { href: "/help", label: "Video Tutorials", external: false },
];

export default async function SystemOverviewPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const tenant = await getTenantRow();
  const checks = await runHealthChecks(null);
  const bad = checks.filter((c) => c.status !== "ok");

  const db = createServerClient();
  const [{ count: staffCount }, { count: warehouseCount }] = await Promise.all([
    db.from("portal_users").select("id", { count: "exact", head: true }).eq("tenant_id", getTenantId()),
    db.from("erp_warehouses").select("id", { count: "exact", head: true }).eq("tenant_id", getTenantId()),
  ]);

  return (
    <div>
      <PageHead title="System" />
      {bad.length > 0 && (
        <div className="adm-alert adm-alert-error">
          {bad.length} health check{bad.length === 1 ? "" : "s"} need attention: {bad.map((c) => c.label).join(", ")}.{" "}
          <Link href="/admin/system/health" style={{ textDecoration: "underline" }}>Open System Health</Link>
        </div>
      )}
      <div className="adm-grid adm-grid-4" style={{ marginBottom: 16 }}>
        <Kpi label="Business" value={tenant?.name ?? "—"} foot={tenant?.domain ?? "No domain set"} tip="Your business's name and storefront address, as set under Organization." />
        <Kpi label="Staff Accounts" value={staffCount ?? 0} foot="Admin center users" tip="People who can sign in to this admin. Manage them under Admin Users." />
        <Kpi label="Locations" value={warehouseCount ?? 0} foot="Warehouses & branches" tip="Warehouses and branches on record. Manage them under Locations & Branches." />
        <Kpi label="Services Operational" value={`${checks.length - bad.length}/${checks.length}`} foot="Live health probes" tip="Live health probes for the API, database, payments, email, jobs, and backups. Anything failing is listed at the top of this page and in System Health." />
      </div>
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-card">
          <h2>Settings &amp; administration</h2>
          <div style={{ display: "grid", gap: 4 }}>
            {SECTIONS.map((s) => (
              <Link key={s.href} href={s.href} style={{ display: "block", padding: "8px 6px", borderBottom: "1px solid var(--border)" }}>
                <strong style={{ fontSize: 13 }}>{s.title}</strong>
                <br />
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{s.desc}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="adm-card">
          <h2>Quick links</h2>
          <div style={{ display: "grid", gap: 4 }}>
            {QUICK_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
                style={{ display: "block", padding: "8px 6px", borderBottom: "1px solid var(--border)", fontSize: 13 }}
              >
                {l.label} →
              </Link>
            ))}
          </div>
          <h2 style={{ marginTop: 22 }}>Organization</h2>
          <dl className="adm-dl">
            <dt>Business</dt>
            <dd>{tenant?.name ?? "—"}</dd>
            <dt>Contact email</dt>
            <dd>{tenant?.contact_email ?? "—"}</dd>
            <dt>Timezone</dt>
            <dd>{tenant?.timezone ?? "—"}</dd>
            <dt>Currency</dt>
            <dd>{tenant?.currency ?? "—"}</dd>
            <dt>Status</dt>
            <dd>{tenant?.status ?? "—"}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
