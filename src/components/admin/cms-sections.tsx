"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ExternalLink } from "lucide-react";

// ============================================================================
// SHARED — generic CMS list view for simple entities
// ============================================================================
function useCmsData<T>(endpoint: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(endpoint).then(r => r.json()).then(d => setData(d[Object.keys(d)[0]] ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, [endpoint]);
  return { data, loading, setData };
}

function CmsCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "4px 0 0" }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>{msg}</div>;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = { published: "var(--primary)", active: "var(--primary)", draft: "var(--muted-foreground)", expired: "var(--destructive)", paused: "var(--warning)", scheduled: "var(--info)", completed: "var(--muted-foreground)" };
  return <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[status] || "var(--muted-foreground)", flexShrink: 0 }} />;
}

// ============================================================================
// NAVIGATION VIEW
// ============================================================================
export function NavigationView() {
  const { data: menus, loading } = useCmsData<any>("/api/admin/cms/navigation?withItems=true");
  return (
    <CmsCard title="Navigation & Menus" subtitle={`${menus?.length || 0} menus — header, footer, mobile drawer`}>
      {loading ? <EmptyState msg="Loading…" /> : menus?.length === 0 ? <EmptyState msg="No navigation menus configured." /> : (
        <div>
          {menus.map((menu: any, i: number) => (
            <div key={menu.id} style={{ padding: "20px 28px", borderBottom: i < menus.length - 1 ? "1px solid var(--muted)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <StatusDot status={menu.status} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{menu.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground)" }}>{menu.location}</span>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{menu.items?.length || 0} items</span>
              </div>
              {menu.items?.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: 18 }}>
                  {menu.items.map((item: any) => (
                    <span key={item.id} style={{ fontSize: 11, padding: "4px 10px", background: "var(--muted)", borderRadius: 6, color: "var(--foreground)" }}>
                      {item.label} <span style={{ color: "var(--muted-foreground)" }}>→ {item.href}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CmsCard>
  );
}

// ============================================================================
// MEDIA LIBRARY VIEW
// ============================================================================
export function MediaLibraryView() {
  const { data: assets, loading } = useCmsData<any>("/api/admin/cms/media");
  return (
    <CmsCard title="Media Library" subtitle={`${assets?.length || 0} assets — images, CDN optimization, taxonomy`}>
      {loading ? <EmptyState msg="Loading…" /> : assets?.length === 0 ? <EmptyState msg="No media assets uploaded." /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, padding: "20px 28px" }}>
          {assets.map((a: any) => (
            <div key={a.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ aspectRatio: 1, background: "var(--muted)", backgroundImage: `url(${a.url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
              <div style={{ padding: "8px 10px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.alt_text || a.media_id}</div>
                <div style={{ fontSize: 9, color: "var(--muted-foreground)", marginTop: 2 }}>{a.mime_type}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CmsCard>
  );
}

// ============================================================================
// WEBSITE SETTINGS VIEW
// ============================================================================
export function WebsiteSettingsView() {
  const { data: settings, loading } = useCmsData<any>("/api/admin/cms/settings");
  const s = settings?.[0] || {};
  return (
    <CmsCard title="Website Settings" subtitle="Brand identity, SEO defaults, analytics, security, locales">
      {loading ? <EmptyState msg="Loading…" /> : (
        <div style={{ padding: "24px 28px", display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Brand Name" value={s.brand_name || "UnSaid Memories"} />
            <Field label="Default Locale" value={s.default_locale || "en-US"} />
            <Field label="Default Currency" value={s.default_currency || "USD"} />
            <Field label="Canonical Origin" value={s.canonical_origin || "—"} />
            <Field label="GTM Container" value={s.gtm_container || "—"} />
            <Field label="CSP Mode" value={s.csp_mode || "report-only"} />
          </div>
          {s.maintenance_mode && (
            <div style={{ padding: "12px 16px", background: "color-mix(in srgb, var(--destructive) 7%, var(--card))", border: "1px solid color-mix(in srgb, var(--destructive) 45%, var(--card))", borderRadius: 8, fontSize: 12, color: "var(--destructive)" }}>
              ⚠ Maintenance mode is ON — the storefront shows a maintenance message.
            </div>
          )}
        </div>
      )}
    </CmsCard>
  );
}

// ============================================================================
// OFFERS VIEW
// ============================================================================
export function OffersView() {
  const { data: offers, loading } = useCmsData<any>("/api/admin/cms/offers");
  return (
    <CmsCard title="Offers & Discounts" subtitle={`${offers?.length || 0} offers — promo codes, volume tiers, bundle rules`}>
      {loading ? <EmptyState msg="Loading…" /> : offers?.length === 0 ? <EmptyState msg="No offers configured." /> : (
        <div>
          {offers.map((o: any, i: number) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 28px", borderBottom: i < offers.length - 1 ? "1px solid var(--muted)" : "none" }}>
              <StatusDot status={o.status} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{o.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>Code: {o.code} · {o.offer_type} · {o.value}% off</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: o.status === "active" ? "var(--primary)" : "var(--muted-foreground)" }}>{o.status}</div>
            </div>
          ))}
        </div>
      )}
    </CmsCard>
  );
}

// ============================================================================
// DESIGN TOKENS VIEW
// ============================================================================
export function DesignTokensView() {
  const { data: tokens, loading } = useCmsData<any>("/api/admin/cms/tokens");
  const categories = ["color", "typography", "spacing", "radius", "shadow", "border", "motion"] as const;
  return (
    <CmsCard title="Design Tokens" subtitle={`${tokens?.length || 0} tokens — colors, typography, spacing, the brand system`}>
      {loading ? <EmptyState msg="Loading…" /> : tokens?.length === 0 ? <EmptyState msg="No design tokens configured. Seed defaults to load the UnSaid teal brand system." /> : (
        <div style={{ padding: "20px 28px" }}>
          {categories.map(cat => {
            const catTokens = tokens.filter((t: any) => t.category === cat);
            if (catTokens.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--muted-foreground)", marginBottom: 10 }}>{cat}</h3>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {catTokens.map((t: any) => (
                    <div key={t.id} style={{ padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                      {t.category === "color" && <div style={{ width: 20, height: 20, borderRadius: 4, background: t.token_value, border: "1px solid var(--border)" }} />}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)" }}>{t.token_key}</div>
                        <div style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "monospace" }}>{t.token_value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CmsCard>
  );
}

// ============================================================================
// GLOBAL COPY VIEW
// ============================================================================
export function GlobalCopyView() {
  const { data: copy, loading } = useCmsData<any>("/api/admin/cms/copy");
  return (
    <CmsCard title="Global Copy & Translations" subtitle={`${copy?.length || 0} strings — translatable copy across the storefront`}>
      {loading ? <EmptyState msg="Loading…" /> : copy?.length === 0 ? <EmptyState msg="No copy strings configured." /> : (
        <div>
          {copy.map((c: any, i: number) => (
            <div key={c.id} style={{ display: "flex", gap: 16, padding: "14px 28px", borderBottom: i < copy.length - 1 ? "1px solid var(--muted)" : "none" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", minWidth: 160, fontFamily: "monospace" }}>{c.copy_key}</div>
              <div style={{ flex: 1, fontSize: 12, color: "var(--foreground)" }}>{c.copy_value}</div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{c.locale}</div>
            </div>
          ))}
        </div>
      )}
    </CmsCard>
  );
}

// ============================================================================
// REDIRECTS VIEW
// ============================================================================
export function RedirectsView() {
  const { data: redirects, loading } = useCmsData<any>("/api/admin/cms/redirects");
  return (
    <CmsCard title="URL Redirects" subtitle={`${redirects?.length || 0} redirects — manage 301/302/307/308 redirects`}>
      {loading ? <EmptyState msg="Loading…" /> : redirects?.length === 0 ? <EmptyState msg="No redirects configured." /> : (
        <div>
          {redirects.map((r: any, i: number) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 28px", borderBottom: i < redirects.length - 1 ? "1px solid var(--muted)" : "none" }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "var(--accent)", color: "var(--primary)" }}>{r.status_code}</span>
              <span style={{ fontSize: 12, color: "var(--foreground)" }}>{r.from_url}</span>
              <ExternalLink size={12} style={{ color: "var(--muted-foreground)" }} />
              <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 600 }}>{r.to_url}</span>
            </div>
          ))}
        </div>
      )}
    </CmsCard>
  );
}

// ============================================================================
// AUDIT LOG VIEW
// ============================================================================
export function AuditLogView() {
  const { data: entries, loading } = useCmsData<any>("/api/admin/cms/audit?limit=50");
  return (
    <CmsCard title="Audit History & Security Stream" subtitle={`${entries?.length || 0} events — every CMS mutation, tracked`}>
      {loading ? <EmptyState msg="Loading…" /> : entries?.length === 0 ? <EmptyState msg="No audit events yet." /> : (
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          {entries.map((e: any, i: number) => (
            <div key={e.id} style={{ display: "flex", gap: 14, padding: "12px 28px", borderBottom: i < entries.length - 1 ? "1px solid var(--muted)" : "none" }}>
              <div style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "var(--muted)", color: "var(--foreground)", minWidth: 70, textAlign: "center" }}>{e.action}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--foreground)" }}>{e.entity}{e.entity_id ? `: ${e.entity_id.slice(0, 8)}` : ""}</div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{e.user_id || "system"} · {e.ip_address || "—"} · {new Date(e.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CmsCard>
  );
}

// ============================================================================
// CAMPAIGNS VIEW
// ============================================================================
export function CampaignsView() {
  const { data: campaigns, loading } = useCmsData<any>("/api/admin/cms/campaigns");
  return (
    <CmsCard title="Campaigns" subtitle={`${campaigns?.length || 0} campaigns — schedule content, target segments, deploy`}>
      {loading ? <EmptyState msg="Loading…" /> : campaigns?.length === 0 ? <EmptyState msg="No campaigns configured." /> : (
        <div>
          {campaigns.map((c: any, i: number) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 28px", borderBottom: i < campaigns.length - 1 ? "1px solid var(--muted)" : "none" }}>
              <StatusDot status={c.status} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{c.campaign_type} · {c.content_block_ids?.length || 0} blocks · {c.start_date ? new Date(c.start_date).toLocaleDateString() : "no start"}</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: c.status === "active" ? "var(--primary)" : "var(--muted-foreground)" }}>{c.status}</div>
            </div>
          ))}
        </div>
      )}
    </CmsCard>
  );
}

// ============================================================================
// PAGES VIEW
// ============================================================================
export function PagesView() {
  const { data: pages, loading } = useCmsData<any>("/api/admin/cms/pages");
  return (
    <CmsCard title="Pages & Routes" subtitle={`${pages?.length || 0} pages — route definitions, SEO config, layout templates`}>
      {loading ? <EmptyState msg="Loading…" /> : pages?.length === 0 ? <EmptyState msg="No pages configured. Pages are auto-registered when content blocks are placed on routes." /> : (
        <div>
          {pages.map((p: any, i: number) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 28px", borderBottom: i < pages.length - 1 ? "1px solid var(--muted)" : "none" }}>
              <StatusDot status={p.status} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{p.title}</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{p.route} · {p.page_type} · {p.locale}</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: p.status === "published" ? "var(--primary)" : "var(--muted-foreground)" }}>{p.status}</div>
            </div>
          ))}
        </div>
      )}
    </CmsCard>
  );
}

// ============================================================================
// HELPER
// ============================================================================
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 600 }}>{value}</div>
    </div>
  );
}
