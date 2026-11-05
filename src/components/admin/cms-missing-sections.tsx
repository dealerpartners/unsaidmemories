"use client";

/**
 * cms-missing-sections.tsx
 *
 * 19 dedicated CMS section views for the Unsaid Memories admin platform.
 * Each view corresponds to a design file in /tmp/unsaid-cms/UNSAID CMS/
 * and is rendered via the CmsDashboard router on `?view=<key>`:
 *
 *   view=audience            -> AudienceTargetingView
 *   view=banners             -> BannersView
 *   view=web-vitals          -> WebVitalsView
 *   view=edge-optimization   -> EdgeOptimizationView
 *   view=funnel              -> FunnelView
 *   view=integrations        -> IntegrationsView
 *   view=mobile-drawer       -> MobileDrawerView
 *   view=locales             -> LocalesView
 *   view=storefront-engine   -> StorefrontEngineView
 *   view=prop-validators     -> PropValidatorsView
 *   view=block-schemas       -> BlockSchemasView
 *   view=slot-catalog        -> SlotCatalogView
 *   view=footer-builder      -> FooterBuilderView
 *   view=volume-tiers        -> VolumeTiersView
 *   view=fallback-pages      -> FallbackPagesView
 *   view=locale-sync         -> LocaleSyncView
 *   view=media-taxonomy      -> MediaTaxonomyView
 *   view=mega-menu-builder   -> MegaMenuBuilderView
 *   view=storefront-preview  -> StorefrontPreviewView
 *
 * All views adopt the teal design system (var(--primary) primary, .adm-card,
 * Inter font) used by the existing cms-sections.tsx and cms-editors.tsx.
 */

import { useEffect, useState, useCallback, type JSX } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  Gauge,
  GitBranch,
  Globe,
  Hash,
  Image as ImageIcon,
  Layers,
  Layout,
  Link as LinkIcon,
  ListTree,
  Menu,
  MoreHorizontal,
  Network,
  Package,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Tag,
  Terminal,
  Trash2,
  TriangleAlert,
  Upload,
  Wrench,
  Zap,
} from "lucide-react";

// ============================================================================
// SHARED DESIGN TOKENS
// ============================================================================
const T = {
  primary: "var(--primary)",
  primaryTint: "var(--accent)",
  ink: "var(--foreground)",
  body: "var(--foreground)",
  subtle: "var(--muted-foreground)",
  muted: "var(--muted-foreground)",
  line: "var(--border)",
  faint: "var(--muted)",
  chip: "var(--muted)",
  surface: "var(--card)",
  ok: "var(--primary)",
  warn: "var(--warning)",
  bad: "var(--destructive)",
  info: "var(--info)",
  idle: "var(--muted-foreground)",
};

type StatusTone = "ok" | "warn" | "bad" | "info" | "idle";
const TONE_BG: Record<StatusTone, string> = {
  ok: "var(--accent)",
  warn: "color-mix(in srgb, var(--warning) 12%, var(--card))",
  bad: "color-mix(in srgb, var(--destructive) 7%, var(--card))",
  info: "color-mix(in srgb, var(--info) 10%, var(--card))",
  idle: "var(--muted)",
};
const TONE_FG: Record<StatusTone, string> = {
  ok: T.primary,
  warn: T.warn,
  bad: T.bad,
  info: T.info,
  idle: T.body,
};

function useFetch<T = any>(endpoint: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!endpoint) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [endpoint]);
  const reload = useCallback(() => {
    if (!endpoint) return;
    setLoading(true);
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [endpoint]);
  return { data, loading, error, reload, setData };
}

function firstArray(payload: any): any[] {
  if (!payload || typeof payload !== "object") return [];
  const key = Object.keys(payload).find((k) => Array.isArray(payload[k]));
  return key ? payload[key] : [];
}

function Chip({
  children,
  tone = "idle",
  mono,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  mono?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".04em",
        textTransform: "uppercase",
        background: TONE_BG[tone],
        color: TONE_FG[tone],
        fontFamily: mono ? "monospace" : undefined,
        border: `1px solid ${T.line}`,
      }}
    >
      {children}
    </span>
  );
}

/* Clean page titles (owner's order, 2026-11-02): the title stands
   alone — no eyebrow/crumb line above the H1 and no description
   paragraph under it; the breadcrumb lives in the shell header. The
   eyebrow/subtitle props were removed here, from Shell, and at every
   call site. */
function SectionHead({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "24px 28px",
        borderBottom: `1px solid ${T.line}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: "4px 0 0",
            color: T.ink,
            letterSpacing: "-.02em",
          }}
        >
          {title}
        </h1>
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  icon: Icon,
  primary,
  onClick,
}: {
  children: React.ReactNode;
  icon?: any;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 32,
        padding: "0 14px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        border: primary ? "none" : `1px solid ${T.line}`,
        background: primary ? T.primary : "var(--card)",
        color: primary ? "var(--card)" : T.ink,
        boxShadow: primary ? "0 1px 3px rgba(0,124,125,0.18)" : "0 1px 2px rgba(20,15,35,0.04)",
      }}
    >
      {Icon && <Icon size={14} />}
      <span>{children}</span>
    </button>
  );
}

function Shell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <SectionHead title={title} actions={actions} />
      {children}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        color: T.muted,
        fontSize: 13,
      }}
    >
      {msg}
    </div>
  );
}

function LoadingRow() {
  return <EmptyState msg="Loading…" />;
}

function MetricCard({
  label,
  value,
  sub,
  tone = "ok",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: StatusTone;
  icon?: any;
}) {
  return (
    <div
      style={{
        padding: "16px 18px",
        border: `1px solid ${T.line}`,
        borderRadius: 10,
        background: "var(--card)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".1em",
            color: T.subtle,
          }}
        >
          {label}
        </span>
        {Icon && <Icon size={14} style={{ color: T.muted }} />}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: TONE_FG[tone], letterSpacing: "-.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  right,
  children,
  noPad,
}: {
  title: string;
  subtitle?: string;
  icon?: any;
  right?: React.ReactNode;
  children: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <section
      style={{
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: right || subtitle ? `1px solid ${T.line}` : "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {Icon && (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: T.primaryTint,
                color: T.primary,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={15} />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: T.ink,
                letterSpacing: "-.01em",
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 11, color: T.subtle, marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
        </div>
        {right && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{right}</div>}
      </div>
      <div style={noPad ? undefined : { padding: "18px 20px" }}>{children}</div>
    </section>
  );
}

function DataTable<T>({
  headers,
  items,
  renderRow,
}: {
  headers: React.ReactNode[];
  items: T[];
  renderRow: (item: T, idx: number) => React.ReactNode;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  padding: "10px 16px",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".1em",
                  color: T.subtle,
                  background: T.faint,
                  borderBottom: `1px solid ${T.line}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={idx}
              style={{ borderBottom: `1px solid ${T.faint}` }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.faint)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {renderRow(item, idx)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Td({
  children,
  style,
  align,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  align?: "right" | "center" | "left";
}) {
  return (
    <td
      style={{
        padding: "12px 16px",
        color: T.ink,
        verticalAlign: "middle",
        textAlign: align,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

function Progress({ value, tone = "ok" }: { value: number; tone?: StatusTone }) {
  return (
    <div
      style={{
        height: 4,
        background: T.faint,
        borderRadius: 99,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: "100%",
          background: TONE_FG[tone],
        }}
      />
    </div>
  );
}

function Toggle({ on }: { on?: boolean }) {
  return (
    <div
      style={{
        width: 30,
        height: 16,
        borderRadius: 99,
        background: on ? T.primary : T.idle,
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "var(--card)",
          transition: "left .15s",
        }}
      />
    </div>
  );
}

// ============================================================================
// 1. AUDIENCE TARGETING, SEGMENTATION & TRIGGER LOGIC
//    view=audience
// ============================================================================
type Segment = {
  id: string;
  name: string;
  description: string;
  status: "active" | "draft" | "paused";
  campaign: string;
  payloadKb: number;
  triggers: { label: string; expr: string; source: string }[];
};

const SEED_SEGMENTS: Segment[] = [
  {
    id: "seg_01",
    name: "First-Time Visitors (Zero Prior Orders)",
    description: "Target cold traffic with primary acquisition welcome incentives and modal discount drawers.",
    status: "active",
    campaign: "Global_Welcome_Modal_10OFF",
    payloadKb: 1.2,
    triggers: [
      { label: "Session.Count", expr: "== 1", source: "LocalStorage.sn_s_cnt" },
      { label: "Cart.ItemCount", expr: "== 0", source: "Storefront.cart_lines" },
      { label: "TriggerDelay: 5000ms", expr: "|| ExitIntent: CursorVelocity >= 1200px/s", source: "PointerVector.Y <= 0" },
    ],
  },
  {
    id: "seg_02",
    name: "VIP High LTV Tier (Spend > $500)",
    description: "High affinity client triggers offering complimentary priority shipping and concierge booking banners.",
    status: "active",
    campaign: "VIP_Concierge_Banner_TopRail",
    payloadKb: 0.9,
    triggers: [
      { label: "ShopifyCustomer.Tags", expr: "CONTAINS \"VIP\"", source: "Customer.metafield_ltv" },
      { label: "Cart.Subtotal", expr: ">= $100.00 USD", source: "Storefront.checkout_subtotal" },
      { label: "Edge.Cookie.sn_vip_active", expr: "== true", source: "Cloudflare.Worker_Cookie" },
    ],
  },
  {
    id: "seg_03",
    name: "Cart Abandonment Risk",
    description: "Fires mid-funnel save prompt when user pauses interaction or maneuvers toward browser controls.",
    status: "active",
    campaign: "Cart_Saver_Checkout_Overlay",
    payloadKb: 1.5,
    triggers: [
      { label: "Cart.Items", expr: "> 0", source: "CheckoutState.active" },
      { label: "DOM.InactivityTimeout", expr: "> 45s", source: "Window.idle_observer" },
      { label: "Cursor.TargetVector", expr: "MATCH BrowserTabCloseArea", source: "ClientSensor.mouse_delta_y < 0" },
    ],
  },
];

export function AudienceTargetingView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/campaigns");
  const [segments] = useState<Segment[]>(SEED_SEGMENTS);
  const campaigns: any[] = data ? firstArray(data) : [];

  const [sim, setSim] = useState({
    sessions: 1,
    cartItems: 0,
    cartValue: 0,
    vip: false,
    country: "US",
    device: "desktop",
    intent: "delay",
  });

  function evaluate(seg: Segment) {
    if (seg.id === "seg_01") {
      const okSession = sim.sessions <= 1;
      const okCart = sim.cartItems === 0;
      const okTrigger = sim.intent === "delay" || sim.intent === "exit";
      return okSession && okCart && okTrigger;
    }
    if (seg.id === "seg_02") {
      return sim.vip && sim.cartValue >= 100;
    }
    if (seg.id === "seg_03") {
      return sim.cartItems > 0 && (sim.intent === "idle" || sim.intent === "exit");
    }
    return false;
  }

  return (
    <Shell
      title="Audience Targeting, Segmentation & Trigger Logic"
      actions={
        <>
          <ActionBtn icon={CheckCircle2}>Validate Edge Segments</ActionBtn>
          <ActionBtn icon={Plus} primary>
            Create Audience Segment
          </ActionBtn>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 0 }}>
        {/* LEFT PANE — segmentation matrix */}
        <div style={{ padding: 24, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>
              Active Rulesets ({segments.length} Defined)
            </span>
            <span style={{ fontSize: 11, color: T.muted }}>Evaluation Mode: Atomic / Strict</span>
          </div>

          {loading && <LoadingRow />}

          {segments.map((seg, i) => (
            <div
              key={seg.id}
              style={{
                border: `1px solid ${T.line}`,
                borderRadius: 12,
                background: "var(--card)",
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: T.faint,
                      color: T.ink,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <h2 style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: 0 }}>{seg.name}</h2>
                      <Chip tone="ok">[ACTIVE]</Chip>
                    </div>
                    <p style={{ fontSize: 12, color: T.subtle, margin: "4px 0 0", lineHeight: 1.5 }}>{seg.description}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={iconBtn}><Copy size={14} /></button>
                  <button style={iconBtn}><MoreHorizontal size={14} /></button>
                </div>
              </div>

              <div
                style={{
                  background: T.faint,
                  borderRadius: 8,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, marginBottom: 4 }}>
                  Trigger Expression Tree (ALL REQUIRED)
                </div>
                {seg.triggers.map((t, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "var(--card)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: T.ink,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.subtle, flexShrink: 0 }} />
                    <span style={{ color: T.subtle }}>PARAM:</span>
                    <span style={{ fontWeight: 700 }}>{t.label}</span>
                    <span style={{ color: T.subtle }}>{t.expr}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: T.muted }}>{t.source}</span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: T.subtle,
                  paddingTop: 4,
                }}
              >
                <span>
                  Linked Campaign: <span style={{ color: T.ink, fontWeight: 600 }}>{seg.campaign}</span>
                </span>
                <span style={{ fontFamily: "monospace" }}>Edge Payload: {seg.payloadKb} KB</span>
              </div>
            </div>
          ))}

          {/* Frequency capping */}
          <div
            style={{
              border: `1px solid ${T.line}`,
              borderRadius: 12,
              background: "var(--card)",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Settings size={16} style={{ color: T.ink }} />
                <h2 style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: 0 }}>
                  Global Frequency Capping & Suppression Rules
                </h2>
              </div>
              <span style={{ fontSize: 11, color: T.muted }}>Applied to all pop-up engines</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <CapCard
                title="Session Impression Ceiling"
                metric="1 / 7d"
                desc="Maximum 1 pop-up per 7 days per unique browser fingerprint to prevent prompt fatigue."
                meta={["Fingerprint hashing: SHA-256", "Enforced"]}
              />
              <CapCard
                title="Funnel Suppression Fence"
                metric="/checkout/*"
                desc="Automatic complete suppression on order status, payment steps, and active one-page checkout."
                meta={["Path matching: Regex strict", "Active (Zero Bypass)"]}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: T.subtle,
                paddingTop: 8,
                borderTop: `1px solid ${T.faint}`,
              }}
            >
              <div style={{ display: "flex", gap: 12 }}>
                <span>
                  Suppressed sessions (24h):{" "}
                  <span style={{ fontFamily: "monospace", color: T.ink, fontWeight: 700 }}>18,409</span>
                </span>
                <span style={{ color: T.line }}>|</span>
                <span>
                  Delivered payloads:{" "}
                  <span style={{ fontFamily: "monospace", color: T.ink, fontWeight: 700 }}>142,881</span>
                </span>
              </div>
              <span style={{ fontFamily: "monospace" }}>Suppression Rate: 11.4%</span>
            </div>
          </div>
        </div>

        {/* RIGHT PANE — interactive simulator */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel
            title="Interactive Audience Rule Simulator"
            subtitle="Test real-time shopper attributes against edge decision trees."
            icon={Terminal}
            right={<ActionBtn>Reset Defaults</ActionBtn>}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10, background: T.faint, borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>
                Shopper Attributes Under Test
              </div>
              <SimField label="Session Count">
                <input
                  type="number"
                  value={sim.sessions}
                  onChange={(e) => setSim({ ...sim, sessions: Number(e.target.value) })}
                  style={inputStyle}
                />
              </SimField>
              <SimField label="Cart Item Count">
                <input
                  type="number"
                  value={sim.cartItems}
                  onChange={(e) => setSim({ ...sim, cartItems: Number(e.target.value) })}
                  style={inputStyle}
                />
              </SimField>
              <SimField label="Cart Subtotal ($ USD)">
                <input
                  type="number"
                  value={sim.cartValue}
                  step={10}
                  onChange={(e) => setSim({ ...sim, cartValue: Number(e.target.value) })}
                  style={inputStyle}
                />
              </SimField>
              <SimField label="Customer VIP Tag">
                <select
                  value={sim.vip ? "true" : "false"}
                  onChange={(e) => setSim({ ...sim, vip: e.target.value === "true" })}
                  style={inputStyle}
                >
                  <option value="false">false (Anonymous / Standard)</option>
                  <option value="true">true (VIP Customer)</option>
                </select>
              </SimField>
              <SimField label="Geo Location (Edge IP)">
                <select value={sim.country} onChange={(e) => setSim({ ...sim, country: e.target.value })} style={inputStyle}>
                  <option value="US">US - United States</option>
                  <option value="CA">CA - Canada</option>
                  <option value="GB">GB - United Kingdom</option>
                  <option value="DE">DE - Germany</option>
                </select>
              </SimField>
              <SimField label="Device Viewport">
                <select value={sim.device} onChange={(e) => setSim({ ...sim, device: e.target.value })} style={inputStyle}>
                  <option value="desktop">Desktop (1440px)</option>
                  <option value="mobile">Mobile (375px)</option>
                  <option value="tablet">Tablet (768px)</option>
                </select>
              </SimField>
              <SimField label="Simulated Trigger">
                <select value={sim.intent} onChange={(e) => setSim({ ...sim, intent: e.target.value })} style={inputStyle}>
                  <option value="delay">5s Page Duration Elapsed</option>
                  <option value="exit">Cursor Exit-Intent Spike</option>
                  <option value="idle">45s Inactivity Idle</option>
                </select>
              </SimField>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>
                <span>Rules Evaluation Matrix</span>
                <span style={{ fontFamily: "monospace", color: T.muted }}>0.00ms EVAL</span>
              </div>
              {segments.map((seg) => {
                const ok = evaluate(seg);
                return (
                  <div
                    key={seg.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: ok ? T.primaryTint : T.faint,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "var(--card)",
                          color: ok ? T.primary : T.muted,
                          fontWeight: 700,
                        }}
                      >
                        {ok ? "PASS" : "FAIL"}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{seg.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: ok ? T.primary : T.muted, fontFamily: "monospace" }}>
                      {ok ? "→ Deliver payload" : "Suppressed"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="Linked Campaigns"
            subtitle={`${campaigns.length} campaigns available to bind`}
            icon={Calendar}
          >
            {campaigns.length === 0 ? (
              <EmptyState msg="No campaigns available." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {campaigns.slice(0, 5).map((c: any) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: T.ink, fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color: T.muted }}>{c.campaign_type}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

function CapCard({
  title,
  metric,
  desc,
  meta,
}: {
  title: string;
  metric: string;
  desc: string;
  meta: [string, string];
}) {
  return (
    <div style={{ background: T.faint, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{title}</span>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: T.body }}>{metric}</span>
      </div>
      <p style={{ fontSize: 11, color: T.subtle, margin: 0, lineHeight: 1.5 }}>{desc}</p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: T.muted,
          marginTop: 6,
        }}
      >
        <span>{meta[0]}</span>
        <span style={{ color: T.ink, fontWeight: 600 }}>{meta[1]}</span>
      </div>
    </div>
  );
}

function SimField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", gap: 10 }}>
      <label style={{ fontSize: 12, color: T.ink, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 30,
  padding: "0 10px",
  borderRadius: 6,
  border: `1px solid ${T.line}`,
  background: "var(--card)",
  fontSize: 12,
  color: T.ink,
  fontFamily: "monospace",
  width: "100%",
};

const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: "none",
  background: T.faint,
  color: T.subtle,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
};

// ============================================================================
// 2. BANNERS, ANNOUNCEMENT BARS & MODALS
//    view=banners
// ============================================================================
type Banner = {
  id: string;
  label: string;
  placement: string;
  priority: "P1" | "P2" | "P3";
  schedule: string;
  microcopy: string;
  cta: string;
  exclusion: string;
  dismissible: boolean;
  countdown: boolean;
  impressions: string;
  ctr: string;
  status: "active" | "scheduled" | "draft" | "archived";
};

const SEED_BANNERS: Banner[] = [
  {
    id: "bn_01",
    label: "Global Free Shipping Notification Strip",
    placement: "Top Header Strip",
    priority: "P1",
    schedule: "Permanent Active",
    microcopy: "Free shipping over $75 | Use code SHIPFREE at checkout",
    cta: "/collections/new-arrivals",
    exclusion: "/checkout",
    dismissible: true,
    countdown: false,
    impressions: "142.8k",
    ctr: "4.2%",
    status: "active",
  },
  {
    id: "bn_02",
    label: "Winter Solstice Capsule Drop Modal",
    placement: "Center Modal Overlay",
    priority: "P2",
    schedule: "Scheduled: Nov 24",
    microcopy: "The Winter Solstice Capsule has arrived — 48-hour early access for guild members.",
    cta: "/editorial/winter-solstice",
    exclusion: "/checkout, /account",
    dismissible: true,
    countdown: true,
    impressions: "84.2k",
    ctr: "5.8%",
    status: "scheduled",
  },
  {
    id: "bn_03",
    label: "Cart Abandonment Recovery Slide-in",
    placement: "Bottom Right Drawer",
    priority: "P2",
    schedule: "Trigger Based",
    microcopy: "Your selection is selling fast — complete checkout in the next 10 minutes.",
    cta: "/cart",
    exclusion: "/checkout",
    dismissible: true,
    countdown: true,
    impressions: "61.3k",
    ctr: "9.1%",
    status: "active",
  },
  {
    id: "bn_04",
    label: "VIP Concierge Top-Rail Banner",
    placement: "Top Header Strip",
    priority: "P3",
    schedule: "Segment Triggered",
    microcopy: "Priority concierge booking available for VIP clients — your dedicated stylist awaits.",
    cta: "/services/concierge",
    exclusion: "/checkout",
    dismissible: false,
    countdown: false,
    impressions: "18.4k",
    ctr: "2.4%",
    status: "active",
  },
];

export function BannersView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/offers");
  const offers: any[] = data ? firstArray(data) : [];
  const [tab, setTab] = useState<"active" | "scheduled" | "drafts" | "archived">("active");
  const filtered = SEED_BANNERS.filter((b) => b.status === tab);

  return (
    <Shell
      title="Banners, Announcement Bars & Modals"
      actions={
        <>
          <ActionBtn icon={Plus}>Create New Placement</ActionBtn>
        </>
      }
    >
      {/* Tab strip + metrics */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(["active", "scheduled", "drafts", "archived"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: tab === t ? 700 : 500,
                borderRadius: 6,
                border: "none",
                background: tab === t ? T.primary : T.faint,
                color: tab === t ? "var(--card)" : T.body,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t} ({SEED_BANNERS.filter((b) => b.status === t).length})
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <MetricCard label="Active Impressions / 24h" value="418,920" sub="↑ 12.4% vs prev window" icon={Eye} />
          <MetricCard label="Avg Conversion CTR" value="3.88%" sub="Top: Welcome Incentive" icon={BarChart3} />
          <MetricCard label="Suppression Overrides" value="1,204" sub="Checkout funnel locked" icon={Shield} tone="info" />
          <MetricCard label="Edge Pipeline State" value="OPTIMIZED" sub="Zero script delay" icon={Zap} />
        </div>
      </div>

      {/* Placements list */}
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        {loading && <LoadingRow />}
        {filtered.length === 0 && !loading ? (
          <EmptyState msg={`No ${tab} banner placements.`} />
        ) : (
          filtered.map((b) => (
            <div
              key={b.id}
              style={{
                border: `1px solid ${T.line}`,
                borderRadius: 12,
                background: "var(--card)",
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <Chip tone="ok">{b.placement}</Chip>
                    <Chip>Priority: {b.priority}</Chip>
                    <Chip tone={b.schedule === "Permanent Active" ? "ok" : "info"}>Schedule: {b.schedule}</Chip>
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: 0 }}>{b.label}</h3>
                </div>
                <div style={{ display: "flex", gap: 18, textAlign: "right" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{b.impressions}</div>
                    <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" }}>Impressions</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.primary }}>{b.ctr}</div>
                    <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" }}>CTR</div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  background: T.faint,
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, marginBottom: 4 }}>
                    Microcopy Payload
                  </div>
                  <input value={b.microcopy} readOnly style={{ ...inputStyle, width: "100%" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, marginBottom: 4 }}>
                    CTA Target Route
                  </div>
                  <input value={b.cta} readOnly style={{ ...inputStyle, width: "100%" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, marginBottom: 4 }}>
                    Target Surface Exclusion
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
                    <span style={{ background: "var(--card)", padding: "2px 8px", borderRadius: 4, fontFamily: "monospace", color: T.ink }}>All Pages</span>
                    <span style={{ color: T.muted }}>except</span>
                    <span style={{ background: T.chip, padding: "2px 8px", borderRadius: 4, fontFamily: "monospace", color: T.ink }}>{b.exclusion}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, marginBottom: 4 }}>
                    Persistence & Timer
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.ink, paddingTop: 4 }}>
                    <span>Dismissible: <strong>{b.dismissible ? "True (7d cookie)" : "False"}</strong></span>
                    <span style={{ color: T.muted }}>Countdown: {b.countdown ? "Enabled" : "Disabled"}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Linked offers */}
        <Panel
          title="Linked Promo Codes"
          subtitle={`${offers.length} offers eligible for banner integration`}
          icon={Tag}
        >
          {offers.length === 0 ? (
            <EmptyState msg="No offers configured." />
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {offers.slice(0, 6).map((o: any) => (
                <span
                  key={o.id}
                  style={{
                    padding: "4px 10px",
                    background: T.chip,
                    borderRadius: 6,
                    fontSize: 11,
                    color: T.body,
                    fontFamily: "monospace",
                  }}
                >
                  {o.code} · {o.offer_type}
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </Shell>
  );
}

// ============================================================================
// 3. CORE WEB VITALS & EDGE PERFORMANCE BENCHMARKS
//    view=web-vitals
// ============================================================================
const ROUTE_PERF = [
  { pattern: "/", type: "Homepage Hero", lcp: "0.94s", inp: "28ms", cls: "0.01", cache: "99.9%" },
  { pattern: "/category/*", type: "PLP Collection", lcp: "1.24s", inp: "45ms", cls: "0.02", cache: "98.4%" },
  { pattern: "/products/*", type: "PDP Detail", lcp: "1.35s", inp: "52ms", cls: "0.03", cache: "97.1%" },
  { pattern: "/cart", type: "Slideout Drawer", lcp: "0.62s", inp: "32ms", cls: "0.00", cache: "99.5%" },
  { pattern: "/checkout/*", type: "Secure Checkout", lcp: "1.48s", inp: "64ms", cls: "0.01", cache: "Dynamic SSR" },
];

export function WebVitalsView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/pages");
  const pages: any[] = data ? firstArray(data) : [];

  const kpis = [
    { label: "Largest Contentful Paint", value: "1.18", unit: "s", badge: "GOOD", pct: 94.2, sub: "p75 baseline · -0.08s vs last cycle" },
    { label: "Interaction to Next Paint", value: "42", unit: "ms", badge: "GOOD", pct: 98.6, sub: "Hydration stable · +2ms vs last cycle" },
    { label: "Cumulative Layout Shift", value: "0.02", unit: "", badge: "GOOD", pct: 99.4, sub: "Zero reflow · Flat trend" },
    { label: "Time to First Byte", value: "38", unit: "ms", badge: "CACHE HIT", pct: 99.8, sub: "Edge Cache Ratio · Static edge sync" },
  ];

  return (
    <Shell
      title="Core Web Vitals & Edge Performance Benchmarks"
      actions={
        <>
          <ActionBtn icon={Filter}>Filter Segment</ActionBtn>
          <ActionBtn icon={Upload}>Export CSV</ActionBtn>
        </>
      }
    >
      {/* KPI scorecards */}
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ border: `1px solid ${T.line}`, borderRadius: 10, background: "var(--card)", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>
                {k.label}
              </span>
              <Chip tone="ok">{k.badge}</Chip>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.ink, margin: "10px 0", letterSpacing: "-.02em" }}>
              {k.value}
              <span style={{ fontSize: 14, color: T.muted, fontWeight: 500, marginLeft: 4 }}>{k.unit}</span>
            </div>
            <Progress value={k.pct} tone="ok" />
            <div style={{ fontSize: 10, color: T.muted, marginTop: 6 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Route performance table */}
      <div style={{ padding: "0 24px 24px" }}>
        <Panel
          title="Route Performance Breakdown"
          subtitle="5 Storefront Patterns Audited · Real-User Monitoring Sampling: 100% Edge Nodes"
          icon={Gauge}
          noPad
        >
          {loading && <LoadingRow />}
          <DataTable
            headers={["Route Pattern", "Page Type", "p75 LCP", "INP", "CLS", "Cache Hit %", "Status"]}
            items={ROUTE_PERF}
            renderRow={(r) => (
              <>
                <Td><span style={{ fontFamily: "monospace", fontWeight: 700, color: T.ink }}>{r.pattern}</span></Td>
                <Td><span style={{ color: T.body }}>{r.type}</span></Td>
                <Td align="right"><span style={{ fontFamily: "monospace", color: T.ink }}>{r.lcp}</span></Td>
                <Td><span style={{ fontFamily: "monospace", color: T.ink }}>{r.inp}</span></Td>
                <Td><span style={{ fontFamily: "monospace", color: T.ink }}>{r.cls}</span></Td>
                <Td><span style={{ fontFamily: "monospace", color: r.cache.includes("SSR") ? T.muted : T.body }}>{r.cache}</span></Td>
                <Td><Chip tone="ok">Pass</Chip></Td>
              </>
            )}
          />
        </Panel>
      </div>

      {/* Resource budget */}
      <div style={{ padding: "0 24px 24px" }}>
        <Panel
          title="Resource Weight & Payload Budget"
          subtitle="Client hydration bundles and critical path byte sizes vs budget guidelines."
          icon={Layers}
          right={<Chip tone="ok" mono>TOTAL PAYLOAD: 646 KB GZIPPED</Chip>}
        >
          <BudgetBar label="JavaScript Bundle (runtime, vendor chunk, hydration)" value={142} budget={200} detail="Code-splitting active: 18 modular fragments" />
          <BudgetBar label="CSS (Tailwind purged + design tokens)" value={48} budget={80} detail="PostCSS purge · JIT compiled" />
          <BudgetBar label="First-party JSON API payloads" value={92} budget={120} detail="Edge KV cache 99.8% hit" />
          <BudgetBar label="Third-party scripts (GTM, consent)" value={36} budget={60} detail="Sandboxed via partytown" />
        </Panel>
      </div>

      {/* Synthetic diagnostic runner */}
      <div style={{ padding: "0 24px 24px" }}>
        <Panel
          title="Synthetic Edge Diagnostic Runner"
          subtitle="Schedule simulated Lighthouse runs against any registered route."
          icon={Activity}
          right={
            <>
              <select style={inputStyle}>
                <option>All Routes</option>
                {ROUTE_PERF.map((r) => (
                  <option key={r.pattern}>{r.pattern}</option>
                ))}
              </select>
              <ActionBtn icon={Zap} primary>
                Run Now
              </ActionBtn>
            </>
          }
        >
          {pages.length === 0 && !loading ? (
            <EmptyState msg="No pages registered for diagnostic runs." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(pages.length ? pages.slice(0, 4) : ROUTE_PERF).map((p: any, i: number) => (
                <div
                  key={p.id || i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: T.faint,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontFamily: "monospace", color: T.ink, fontWeight: 700 }}>{p.route || p.pattern}</span>
                  <span style={{ color: T.muted }}>Last run: 12m ago · Score 98</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </Shell>
  );
}

function BudgetBar({ label, value, budget, detail }: { label: string; value: number; budget: number; detail: string }) {
  const pct = Math.round((value / budget) * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{label}</span>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: T.body }}>
          {value} KB / {budget} KB Budget
        </span>
      </div>
      <Progress value={pct} tone={pct > 85 ? "warn" : "ok"} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.muted, marginTop: 4 }}>
        <span>{detail}</span>
        <span>{pct}% of budget utilized</span>
      </div>
    </div>
  );
}

// ============================================================================
// 4. EDGE IMAGE OPTIMIZATION & RESPONSIVE CDN PROFILES
//    view=edge-optimization
// ============================================================================
const PROFILES = [
  { id: "hero_retina_widescreen", desc: "L1 Header Viewport", res: "2560 × 1440", fmt: "AVIF/WebP Auto", q: 85, sharp: "Sharp 0.5", crop: "Center Max", scope: "14 routes" },
  { id: "pdp_gallery_zoom", desc: "Catalog Modal Hi-Res", res: "1800 × 2400", fmt: "WebP/JPEG", q: 90, sharp: "Lossless", crop: "Lossless Crop", scope: "240 products", active: true },
  { id: "plp_grid_thumbnail", desc: "Category Grid Tile", res: "600 × 800", fmt: "WebP", q: 80, sharp: "Lanczos3", crop: "Smart Gravity", scope: "3,420 catalog tiles" },
  { id: "cart_avatar_compact", desc: "Mini-Cart Slideout", res: "160 × 200", fmt: "WebP", q: 75, sharp: "Bicubic", crop: "Fit Contain", scope: "Global checkout" },
];

export function EdgeOptimizationView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/media");
  const assets: any[] = data ? firstArray(data) : [];
  const [selected, setSelected] = useState(PROFILES[1].id);
  const active = PROFILES.find((p) => p.id === selected) || PROFILES[0];

  return (
    <Shell
      title="Edge Image Optimization & Responsive CDN Profiles"
      actions={<ActionBtn icon={Plus} primary>New Variant Profile</ActionBtn>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 0 }}>
        {/* LEFT — active profiles + policies */}
        <div style={{ padding: 24, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel title="Active Transformation Profiles" subtitle={`${PROFILES.length} Loaded`} icon={Layers} noPad>
            {loading && <LoadingRow />}
            <DataTable
              headers={["Profile Identifier", "Resolution", "Negotiation", "Fidelity", "Crop Logic", "Topology Scope"]}
              items={PROFILES}
              renderRow={(p) => (
                <>
                  <Td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {p.active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.primary }} />}
                      <div>
                        <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: T.ink }}>{p.id}</div>
                        <div style={{ fontSize: 10, color: T.muted }}>{p.desc}</div>
                      </div>
                    </div>
                  </Td>
                  <Td><span style={{ fontFamily: "monospace", fontSize: 11, color: T.body }}>{p.res}</span></Td>
                  <Td><Chip tone="ok" mono>{p.fmt}</Chip></Td>
                  <Td>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: T.ink, fontWeight: 700 }}>Q: {p.q}</div>
                    <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>{p.sharp}</div>
                  </Td>
                  <Td><span style={{ fontFamily: "monospace", fontSize: 11, color: T.body }}>{p.crop}</span></Td>
                  <Td><span style={{ fontFamily: "monospace", fontSize: 11, color: T.body }}>{p.scope}</span></Td>
                </>
              )}
            />
          </Panel>

          <Panel title="Global Ingest & Optimization Policies" subtitle="Applied to S3 Media Bucket" icon={Settings}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <PolicyCard
                title="Accept Header Transcode"
                desc="Auto-convert JPEG/PNG to AVIF when browser client negotiates standard header match."
                meta="MIME: image/avif"
                footer="Prioritized"
                enabled
              />
              <PolicyCard
                title="Metadata Ingest Strip"
                desc="Strip EXIF, XMP, & IPTC metadata on raw asset ingest pipeline automatically."
                meta="Payload Delta:"
                footer="-14.2% Saved"
                enabled
              />
              <PolicyCard
                title="Lossy Compression Guard"
                desc="Enforce quality threshold clamping: 82% max for WebP fallback, 78% for AVIF stream."
                meta="SSIM Score:"
                footer="> 0.984"
                tuned
              />
            </div>
          </Panel>

          <div
            style={{
              padding: 16,
              background: T.faint,
              borderRadius: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.ink }}>
                Edge Cache Egress Distribution
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Last 24h: 4.88M images transcoded on-the-fly</div>
            </div>
            <div style={{ display: "flex", gap: 18 }}>
              <FormatShare label="AVIF FORMAT" value="78.4%" />
              <FormatShare label="WEBP FORMAT" value="20.1%" />
              <FormatShare label="ORIGINAL FALLBACK" value="1.5%" />
            </div>
          </div>
        </div>

        {/* RIGHT — interactive transcode simulator */}
        <div style={{ padding: 24 }}>
          <Panel
            title="Interactive Transcode Simulator"
            subtitle="Real-time edge visual fidelity & byte inspection"
            icon={Eye}
          >
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>
                Target Profile Blueprint
              </label>
              <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 6 }}>
                {PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} ({p.res} · Q{p.q} · {p.sharp})
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "4 / 5",
                background: T.faint,
                borderRadius: 10,
                overflow: "hidden",
                marginBottom: 12,
                display: "grid",
                placeItems: "center",
              }}
            >
              <ImageIcon size={48} style={{ color: T.muted }} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `${T.primary}22`,
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: 12,
                  right: 12,
                  background: "rgba(255,255,255,0.96)",
                  borderRadius: 8,
                  padding: 12,
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 2px 8px rgba(20,15,35,0.08)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                  <span>Edge Pipeline Loupe (300% Zoom)</span>
                  <span style={{ color: T.muted }}>SSIM: 0.992</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ padding: 8, background: T.faint, borderRadius: 6 }}>
                    <div style={{ fontSize: 9, textTransform: "uppercase", color: T.muted, letterSpacing: ".1em" }}>Original TIFF (Master)</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, fontFamily: "monospace" }}>48.2 MB</div>
                    <div style={{ fontSize: 10, color: T.muted }}>Uncompressed RAW</div>
                  </div>
                  <div style={{ padding: 8, background: T.primaryTint, borderRadius: 6 }}>
                    <div style={{ fontSize: 9, textTransform: "uppercase", color: T.primary, letterSpacing: ".1em" }}>Transcoded AVIF</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, fontFamily: "monospace" }}>218 KB</div>
                    <div style={{ fontSize: 10, color: T.primary, fontWeight: 600 }}>99.5% Net Reduction</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.muted, fontFamily: "monospace" }}>
              <span>fw25_jacket_editorial_hi_res.tiff</span>
              <span>4096 × 5120 px</span>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, marginBottom: 6 }}>
                Format Variant Inspector
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {["AVIF Variant", "WebP Variant", "JPEG Fallback"].map((f, i) => (
                  <button
                    key={f}
                    style={{
                      padding: "8px 6px",
                      fontSize: 11,
                      fontWeight: i === 0 ? 700 : 500,
                      color: i === 0 ? T.ink : T.body,
                      background: i === 0 ? "var(--card)" : T.faint,
                      border: i === 0 ? `1px solid ${T.line}` : "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <span>{f}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>
                      {i === 0 ? "218 KB" : i === 1 ? "284 KB" : "612 KB"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.faint}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, marginBottom: 8 }}>
                Available Source Assets ({assets.length})
              </div>
              {assets.length === 0 && !loading ? (
                <EmptyState msg="No media assets ingested." />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  {assets.slice(0, 6).map((a: any) => (
                    <div
                      key={a.id}
                      style={{
                        aspectRatio: 1,
                        borderRadius: 6,
                        background: T.faint,
                        backgroundImage: `url(${a.url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

function PolicyCard({
  title,
  desc,
  meta,
  footer,
  enabled,
  tuned,
}: {
  title: string;
  desc: string;
  meta: string;
  footer: string;
  enabled?: boolean;
  tuned?: boolean;
}) {
  return (
    <div style={{ background: T.faint, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{title}</span>
          {enabled && <Chip tone="ok">ENABLED</Chip>}
          {tuned && <Chip tone="info">TUNED</Chip>}
        </div>
        <p style={{ fontSize: 11, color: T.subtle, lineHeight: 1.5, margin: 0 }}>{desc}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.muted, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.line}`, fontFamily: "monospace" }}>
        <span>{meta}</span>
        <span style={{ color: T.ink, fontWeight: 700 }}>{footer}</span>
      </div>
    </div>
  );
}

function FormatShare({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: "monospace" }}>{value}</span>
      <span style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: ".1em" }}>{label}</span>
    </div>
  );
}

// ============================================================================
// 5. FUNNEL CONVERSION & DROP-OFF TELEMETRY
//    view=funnel
// ============================================================================
const FUNNEL_STEPS = [
  { step: 1, label: "Storefront Landing & PDP Views", routes: "/catalog, /products/*", sessions: 284500, pct: 100 },
  { step: 2, label: "Product Detail Engagement", routes: "/products/*", sessions: 33571, pct: 11.8 },
  { step: 3, label: "Add-to-Cart Action", routes: "/cart/add", sessions: 17639, pct: 6.2 },
  { step: 4, label: "Checkout Initiated", routes: "/checkout/start", sessions: 9736, pct: 3.42 },
  { step: 5, label: "Payment Authorized", routes: "/checkout/payment", sessions: 6310, pct: 2.22 },
  { step: 6, label: "Order Confirmation", routes: "/checkout/confirm", sessions: 5908, pct: 2.08 },
];

export function FunnelView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/pages");
  const pages: any[] = data ? firstArray(data) : [];

  const metrics = [
    { label: "Session-to-Order", value: "3.42%", delta: "+0.4% MoM", pct: 34, icon: ArrowRight },
    { label: "Cart Addition Rate", value: "11.8%", delta: "33,571 hits", pct: 11.8, icon: Package },
    { label: "Checkout Start Rate", value: "6.2%", delta: "17,639 sess", pct: 6.2, icon: Power },
    { label: "Cart Recovery", value: "18.4%", delta: "+2.1% MoM", pct: 18.4, icon: RefreshCw },
  ];

  return (
    <Shell
      title="Funnel Conversion & Drop-off Telemetry"
      actions={
        <>
          <ActionBtn icon={Eye}>Switch Log View</ActionBtn>
          <ActionBtn icon={RefreshCw}>Sync Telemetry</ActionBtn>
        </>
      }
    >
      {/* Filter strip */}
      <div
        style={{
          padding: "12px 24px",
          borderBottom: `1px solid ${T.line}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Last 30 Days", "All Devices", "Direct, Organic, Social", "All Shoppers"].map((f) => (
            <button
              key={f}
              style={{
                height: 30,
                padding: "0 12px",
                fontSize: 12,
                borderRadius: 6,
                border: `1px solid ${T.line}`,
                background: "var(--card)",
                color: T.ink,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {f}
              <ChevronDown size={12} style={{ color: T.muted }} />
            </button>
          ))}
        </div>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: T.muted }}>284,500 TOTAL SAMPLES</span>
      </div>

      {/* Primary metrics */}
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} style={{ border: `1px solid ${T.line}`, borderRadius: 10, background: "var(--card)", padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: T.subtle }}>{m.label}</span>
                <Icon size={14} style={{ color: T.muted }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: T.ink }}>{m.value}</div>
              <div style={{ fontSize: 11, color: T.primary, fontFamily: "monospace", marginTop: 2 }}>{m.delta}</div>
              <div style={{ marginTop: 8 }}>
                <Progress value={m.pct} tone="ok" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Funnel progression */}
      <div style={{ padding: "0 24px 24px" }}>
        <Panel
          title="Browse-to-Confirmation Sequence"
          subtitle="Normalized volume retention and progressive friction checkpoints"
          icon={BarChart3}
          right={<Chip mono>SCALE: LOG-ADJUSTED</Chip>}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {FUNNEL_STEPS.map((s, i) => {
              const leakage = i > 0 ? FUNNEL_STEPS[i - 1].pct - s.pct : 0;
              return (
                <div key={s.step}>
                  <div
                    style={{
                      border: `1px solid ${T.line}`,
                      borderRadius: 10,
                      padding: 14,
                      background: "var(--card)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            background: T.faint,
                            color: T.ink,
                            display: "grid",
                            placeItems: "center",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {String(s.step).padStart(2, "0")}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{s.label}</span>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>{s.routes}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{s.sessions.toLocaleString()}</span>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: T.muted, marginLeft: 6 }}>[{s.pct.toFixed(1)}%]</span>
                      </div>
                    </div>
                    <div style={{ height: 12, background: T.faint, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${s.pct}%`, height: "100%", background: T.primary }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.muted, fontFamily: "monospace", marginTop: 4 }}>
                      <span>{i === 0 ? "BASE TRAFFIC ENTRANCE" : `Drop from previous: -${leakage.toFixed(1)}%`}</span>
                      <span>RETENTION: {s.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  {i < FUNNEL_STEPS.length - 1 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 16px",
                        fontSize: 11,
                        color: T.body,
                        fontFamily: "monospace",
                        background: T.faint,
                        borderLeft: `2px solid ${T.line}`,
                        margin: "4px 0",
                      }}
                    >
                      <span>↓ Drop-off leakage to next step</span>
                      <span style={{ color: T.ink, fontWeight: 600 }}>
                        -{(FUNNEL_STEPS[i].pct - FUNNEL_STEPS[i + 1].pct).toFixed(1)}% (
                        {(FUNNEL_STEPS[i].sessions - FUNNEL_STEPS[i + 1].sessions).toLocaleString()} sessions)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Abandonment heatmap + friction inspector */}
      <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel
          title="Primary Abandonment Driver Heatmap & Edge Errors"
          subtitle="Top 4 checkout friction signals ranked by exit volume"
          icon={AlertTriangle}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { cause: "Shipping address validation retry > 2 attempts", exits: 4120, tone: "bad" as StatusTone },
              { cause: "Payment authorization decline (3DS challenge)", exits: 2810, tone: "warn" as StatusTone },
              { cause: "Inventory conflict on cart line item", exits: 1420, tone: "warn" as StatusTone },
              { cause: "Session timeout on payment iframe", exits: 680, tone: "info" as StatusTone },
            ].map((row) => (
              <div
                key={row.cause}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  background: T.faint,
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: TONE_FG[row.tone],
                    }}
                  />
                  <span style={{ color: T.ink }}>{row.cause}</span>
                </div>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.ink }}>{row.exits.toLocaleString()} exits</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Live Checkout Friction Inspector" subtitle="Real-time event stream from edge KV" icon={Activity}>
          {loading && <LoadingRow />}
          {pages.length === 0 && !loading ? (
            <EmptyState msg="No live friction events in the last 5 minutes." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {pages.slice(0, 8).map((p: any, i: number) => (
                <div
                  key={p.id || i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    background: T.faint,
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                >
                  <span style={{ fontFamily: "monospace", color: T.ink }}>{p.route}</span>
                  <span style={{ color: T.muted }}>42s ago · checkout</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </Shell>
  );
}

// ============================================================================
// 6. INTEGRATIONS, API KEYS & WEBHOOK GATEWAYS
//    view=integrations
// ============================================================================
const SERVICES = [
  {
    id: "svc_payload",
    abbr: "PL",
    name: "Payload CMS",
    tag: "HEADLESS CORE",
    badge: "CONNECTED [v3.4.1]",
    desc: "Authoritative headless content schema and structured node repository.",
    endpoint: "https://cms.sunny-apparel.internal/api",
    auth: "Bearer Token (sn_sec_••••••••4f92)",
    websocket: "ACTIVE (11ms ack)",
  },
  {
    id: "svc_shopify",
    abbr: "HC",
    name: "Headless Commerce Engine",
    tag: "SHOPIFY PLUS",
    badge: "ACTIVE [15m Ingest]",
    desc: "Product catalog hierarchy, inventory SKU thresholds, and unified checkout gateway.",
    endpoint: "https://commerce.sunny-apparel.com/graphql",
    auth: "shpat_••••••••33b7 (Read Products, Read Orders)",
    websocket: "Webhook Live [98,401 SKUs mapped]",
  },
  {
    id: "svc_crowdin",
    abbr: "CR",
    name: "Crowdin Translation Pipeline",
    tag: "i18n ENGINE",
    badge: "AUTO-PR SYNC",
    desc: "Automated multi-locale string serialization for 14 storefront language variants.",
    endpoint: "Project: sn-storefront-i18n",
    auth: "Auto Pull Request on String Commit [Enabled]",
    websocket: "Locales: en-US, fr-CA, de-DE, ja-JP, es-ES (+9 others)",
  },
  {
    id: "svc_gtm",
    abbr: "TM",
    name: "Google Tag Manager & Consent",
    tag: "COOKIEBOT / ONETRUST",
    badge: "PROD LIVE",
    desc: "Third-party tag injection, edge script sandboxing, and strict privacy consent signals.",
    endpoint: "GTM Container: GTM-T7K2X9",
    auth: "Server-side data layer mapping [Enabled]",
    websocket: "Consent Mode v2 · TCF v2.2 compliant",
  },
];

const WEBHOOK_LOG = [
  { event: "cms.block.published", target: "https://commerce.sunny-apparel.com/webhooks/cms", status: "200", latency: "84ms", time: "14s ago" },
  { event: "media.asset.transcoded", target: "https://cdn.sunny-apparel.com/ingest/notify", status: "200", latency: "112ms", time: "1m ago" },
  { event: "campaign.scheduled", target: "https://cms.sunny-apparel.internal/hooks/campaign", status: "200", latency: "42ms", time: "3m ago" },
  { event: "redirect.deployed", target: "https://edge.sunny-apparel.com/rules/sync", status: "422", latency: "1.2s", time: "8m ago" },
];

const API_KEYS = [
  { id: "key_01", label: "Storefront Public Read", scopes: "blocks:read, pages:read, media:read", masked: "usaid_pk_••••••2d91", created: "Jan 14, 2026", last: "12m ago" },
  { id: "key_02", label: "Edge Worker Sync", scopes: "blocks:write, redirects:write, audit:write", masked: "usaid_ew_••••••7a04", created: "Dec 02, 2025", last: "2h ago" },
  { id: "key_03", label: "Translation Pipeline", scopes: "copy:read, copy:write, locales:read", masked: "usaid_i18n_••••••b3a8", created: "Nov 18, 2025", last: "yesterday" },
];

export function IntegrationsView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/settings");
  const settings = (data ? firstArray(data) : [])[0] || {};

  return (
    <Shell
      title="Integrations, API Keys & Webhook Gateways"
      actions={
        <>
          <ActionBtn icon={Plus}>Register New Integration</ActionBtn>
          <ActionBtn icon={Hash}>Generate New API Key</ActionBtn>
          <ActionBtn icon={Network}>Test All Connections</ActionBtn>
        </>
      }
    >
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>
            Configured Service Gateways ({SERVICES.length})
          </span>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: T.muted }}>Cluster Region: us-east-prod-az1</span>
        </div>

        {SERVICES.map((svc) => (
          <div
            key={svc.id}
            style={{
              border: `1px solid ${T.line}`,
              borderRadius: 12,
              background: "var(--card)",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: T.faint,
                    color: T.ink,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    border: `1px solid ${T.line}`,
                    flexShrink: 0,
                  }}
                >
                  {svc.abbr}
                </div>
                <div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{svc.name}</span>
                    <Chip tone="ok">{svc.tag}</Chip>
                    <Chip>{svc.badge}</Chip>
                  </div>
                  <p style={{ fontSize: 12, color: T.subtle, margin: "4px 0 0", lineHeight: 1.5 }}>{svc.desc}</p>
                </div>
              </div>
              <Toggle on />
            </div>

            <div
              style={{
                background: T.faint,
                borderRadius: 8,
                padding: 12,
                fontFamily: "monospace",
                fontSize: 11,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.muted }}>ENDPOINT:</span>
                <span style={{ color: T.ink }}>{svc.endpoint}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.muted }}>AUTH STRATEGY:</span>
                <span style={{ color: T.ink }}>{svc.auth}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.muted }}>SYNC CHANNEL:</span>
                <span style={{ color: T.ink, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.primary }} />
                  {svc.websocket}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6, borderTop: `1px solid ${T.faint}` }}>
              <ActionBtn>Rotate Key</ActionBtn>
              <ActionBtn>Configure Sync</ActionBtn>
            </div>
          </div>
        ))}

        {/* Webhook log */}
        <Panel
          title="Outbound Webhook Delivery Log"
          subtitle="Last 50 dispatches across registered gateways"
          icon={Network}
          noPad
        >
          <DataTable
            headers={["Event", "Target URL", "Status", "Latency", "Dispatched"]}
            items={WEBHOOK_LOG}
            renderRow={(w) => (
              <>
                <Td><span style={{ fontFamily: "monospace", fontWeight: 700, color: T.ink }}>{w.event}</span></Td>
                <Td><span style={{ fontFamily: "monospace", fontSize: 11, color: T.body }}>{w.target}</span></Td>
                <Td><Chip tone={w.status.startsWith("2") ? "ok" : "bad"} mono>{w.status}</Chip></Td>
                <Td><span style={{ fontFamily: "monospace", color: T.body }}>{w.latency}</span></Td>
                <Td><span style={{ color: T.muted }}>{w.time}</span></Td>
              </>
            )}
          />
        </Panel>

        {/* API keys */}
        <Panel
          title="Active Scoped API Keys"
          subtitle={`${API_KEYS.length} keys in active rotation`}
          icon={Hash}
          right={<ActionBtn icon={Plus} primary>Issue Key</ActionBtn>}
          noPad
        >
          <DataTable
            headers={["Label", "Scopes", "Masked Token", "Created", "Last Used", "Actions"]}
            items={API_KEYS}
            renderRow={(k) => (
              <>
                <Td><span style={{ fontWeight: 600, color: T.ink }}>{k.label}</span></Td>
                <Td><span style={{ fontFamily: "monospace", fontSize: 11, color: T.body }}>{k.scopes}</span></Td>
                <Td><span style={{ fontFamily: "monospace", fontSize: 11, color: T.ink }}>{k.masked}</span></Td>
                <Td><span style={{ color: T.muted }}>{k.created}</span></Td>
                <Td><span style={{ color: T.muted }}>{k.last}</span></Td>
                <Td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={iconBtn} title="Rotate"><RefreshCw size={12} /></button>
                    <button style={{ ...iconBtn, color: T.bad }} title="Revoke"><Trash2 size={12} /></button>
                  </div>
                </Td>
              </>
            )}
          />
        </Panel>

        {/* Security posture + cURL test */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Panel title="Security Posture & Safeguards" subtitle="Active protections on the integration surface" icon={Shield}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              {[
                ["IP allowlist (CIDR 10.4.0.0/16)", true],
                ["HMAC signature verification", true],
                ["Rate limit: 600 req/min per key", true],
                ["Audit trail: append-only", true],
                ["Key auto-rotation: 90d", false],
              ].map(([label, on]) => (
                <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: T.faint, borderRadius: 6 }}>
                  <span style={{ color: T.ink }}>{String(label)}</span>
                  <Chip tone={on ? "ok" : "idle"}>{on ? "ENFORCED" : "OPTIONAL"}</Chip>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Test Endpoint via cURL" subtitle="Probe any registered integration" icon={Terminal}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <select style={inputStyle}>
                {SERVICES.map((s) => (
                  <option key={s.id}>{s.name}</option>
                ))}
              </select>
              <div
                style={{
                  background: "var(--foreground)",
                  color: "var(--muted)",
                  padding: 12,
                  borderRadius: 8,
                  fontFamily: "monospace",
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                }}
              >
                {`curl -X GET ${SERVICES[0].endpoint}/health \\
  -H "Authorization: Bearer usaid_pk_•••" \\
  -H "X-Tenant: sunny-apparel-prod"`}
              </div>
              <ActionBtn icon={Zap} primary>Execute Probe</ActionBtn>
              <div style={{ fontSize: 11, color: T.muted }}>
                Tenant settings: {settings.brand_name || "UnSaid Memories"} · Default locale {settings.default_locale || "en-US"}
                {loading && " · loading…"}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

// ============================================================================
// 7. MOBILE APP DRAWER & SLIDE-OUT NAVIGATION
//    view=mobile-drawer
// ============================================================================
const MOBILE_UTILITIES = [
  { label: "Currency Switcher", desc: "$ USD (Default)", icon: Tag },
  { label: "Store Locator", desc: "Geo-Detect (On)", icon: Globe },
  { label: "Account Greeting", desc: "Sign In / Profile", icon: Settings },
];

const MOBILE_GROUPS = [
  {
    label: "Shop Men",
    slug: "/collections/men",
    sublinks: [
      { label: "New In", href: "/men/new-in", tag: "NEW" },
      { label: "Outerwear", href: "/men/outerwear" },
      { label: "Knitwear", href: "/men/knitwear" },
      { label: "Tailoring", href: "/men/tailoring" },
      { label: "Shoes", href: "/men/shoes" },
    ],
  },
  {
    label: "Shop Women",
    slug: "/collections/women",
    sublinks: [
      { label: "New In", href: "/women/new-in", tag: "NEW" },
      { label: "Coats", href: "/women/coats" },
      { label: "Dresses", href: "/women/dresses", tag: "FEATURED" },
      { label: "Essentials", href: "/women/essentials" },
    ],
  },
  {
    label: "Capsules & Editions",
    slug: "/editorial/editions",
    sublinks: [
      { label: "Winter Solstice Capsule", href: "/editorial/winter-solstice" },
      { label: "Atelier Archive", href: "/editorial/archive" },
    ],
  },
];

export function MobileDrawerView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/navigation?location=mobile&withItems=true");
  const menus: any[] = data ? firstArray(data) : [];

  return (
    <Shell
      title="Mobile App Drawer & Slide-out Navigation"
      actions={
        <>
          <ActionBtn icon={Plus}>Add Node</ActionBtn>
          <ActionBtn icon={ChevronDown}>Expand All</ActionBtn>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 0 }}>
        {/* LEFT — Tree editor */}
        <div style={{ padding: 24, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel
            title="Mobile Navigation Tree Editor"
            icon={ListTree}
            right={
              <>
                <ActionBtn icon={Plus}>Add Node</ActionBtn>
                <ActionBtn icon={ChevronDown}>Expand</ActionBtn>
              </>
            }
          >
            {/* Top utility bar elements */}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, marginBottom: 8 }}>
              Top Utility Bar Elements
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
              {MOBILE_UTILITIES.map((u) => {
                const Icon = u.icon;
                return (
                  <div
                    key={u.label}
                    style={{
                      padding: 10,
                      background: "var(--card)",
                      border: `1px solid ${T.line}`,
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Icon size={16} style={{ color: T.ink }} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.ink }}>{u.label}</div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: T.muted }}>{u.desc}</div>
                      </div>
                    </div>
                    <Toggle on />
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, marginBottom: 8 }}>
              Main Menu Hierarchy (Accordion & Direct)
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MOBILE_GROUPS.map((g) => (
                <div
                  key={g.label}
                  style={{
                    border: `1px solid ${T.line}`,
                    borderRadius: 10,
                    background: "var(--card)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 14px",
                      background: T.faint,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <ChevronDown size={14} style={{ color: T.muted }} />
                      <Folder size={16} style={{ color: T.ink }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{g.label}</span>
                      <Chip>{g.sublinks.length} Sublinks</Chip>
                    </div>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>slug: {g.slug}</span>
                  </div>
                  <div style={{ padding: "8px 14px 8px 40px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {g.sublinks.map((s) => (
                      <div
                        key={s.label}
                        style={{
                          padding: "6px 10px",
                          background: T.faint,
                          borderRadius: 6,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ color: T.ink, fontWeight: 600 }}>{s.label}</span>
                          {s.tag && <Chip tone="info">{s.tag}</Chip>}
                        </div>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>{s.href}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Behavior & Animation Controls" icon={Settings}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["Drawer Slide Direction", "Right-to-Left"],
                ["Animation Curve", "cubic-bezier(0.4, 0, 0.2, 1)"],
                ["Duration", "240ms"],
                ["Backdrop Opacity", "0.48"],
                ["Swipe Gesture Threshold", "72px"],
                ["Haptic Feedback", "Light (selection)"],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, fontWeight: 700 }}>{label}</span>
                  <span style={{ fontSize: 12, color: T.ink, fontFamily: "monospace" }}>{val}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* RIGHT — Mobile viewport simulator */}
        <div style={{ padding: 24 }}>
          <Panel
            title="Mobile Viewport Simulator"
            subtitle="Live preview · 390 × 844 px (iPhone 14 Pro)"
            icon={Smartphone}
          >
            <div
              style={{
                width: 300,
                margin: "0 auto",
                background: "var(--foreground)",
                borderRadius: 24,
                padding: "10px 6px",
                boxShadow: "0 12px 32px rgba(20,15,35,0.18)",
              }}
            >
              <div
                style={{
                  width: 280,
                  height: 540,
                  background: "var(--card)",
                  borderRadius: 16,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  margin: "0 auto",
                }}
              >
                {/* Mobile status bar */}
                <div
                  style={{
                    background: T.primary,
                    color: "var(--primary-foreground)",
                    padding: "10px 14px",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: ".18em",
                    textAlign: "center",
                  }}
                >
                  SUNNY
                </div>
                {/* Mobile menu list */}
                <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                  {MOBILE_GROUPS.map((g) => (
                    <div key={g.label} style={{ borderBottom: `1px solid ${T.faint}`, paddingBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", gap: 6 }}>
                        <ChevronRight size={12} style={{ color: T.primary }} />
                        {g.label}
                      </div>
                      <div style={{ paddingLeft: 18, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                        {g.sublinks.slice(0, 3).map((s) => (
                          <div key={s.label} style={{ fontSize: 11, color: T.body, display: "flex", justifyContent: "space-between" }}>
                            <span>{s.label}</span>
                            <ChevronRight size={11} style={{ color: T.muted }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Sticky bottom bar */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr",
                    borderTop: `1px solid ${T.line}`,
                    background: T.faint,
                  }}
                >
                  {["Home", "Shop", "Search", "Account"].map((t, i) => (
                    <div
                      key={t}
                      style={{
                        padding: "8px 4px",
                        textAlign: "center",
                        fontSize: 9,
                        color: i === 0 ? T.primary : T.muted,
                        fontWeight: i === 0 ? 700 : 500,
                      }}
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 11, fontFamily: "monospace", color: T.muted }}>
              <span>
                Bundle: <span style={{ color: T.ink, fontWeight: 700 }}>8.4 KB</span>
              </span>
              <span>
                Render: <span style={{ color: T.ink, fontWeight: 700 }}>0.16 ms</span>
              </span>
            </div>

            {loading && <LoadingRow />}
            {menus.length > 0 && (
              <div style={{ marginTop: 12, padding: 10, background: T.faint, borderRadius: 6, fontSize: 11, color: T.body }}>
                Bound menu: {menus[0]?.name} · {menus[0]?.items?.length || 0} items
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

// ============================================================================
// 8. REGIONAL LOCALES & CURRENCY MATRIX
//    view=locales
// ============================================================================
const LOCALES = [
  { code: "en-US", country: "United States", path: "/", currency: "USD ($)", tax: "Exclusive (calculated at checkout)", fallback: "—", catalog: "US Default", state: "active" },
  { code: "en-GB", country: "United Kingdom", path: "/en-gb", currency: "GBP (£)", tax: "20% VAT Incl.", fallback: "en-US", catalog: "UK Tier A", state: "active" },
  { code: "de-DE", country: "Germany / DACH", path: "/de-de", currency: "EUR (€)", tax: "19% MwSt Incl.", fallback: "en-US", catalog: "EU West Central", state: "active" },
  { code: "fr-FR", country: "France & Western EU", path: "/fr-fr", currency: "EUR (€)", tax: "20% TVA Incl.", fallback: "en-US", catalog: "EU West Standard", state: "active" },
  { code: "ja-JP", country: "Japan Storefront", path: "/ja-jp", currency: "JPY (¥)", tax: "10% JCT Incl.", fallback: "en-US", catalog: "APAC Domestic", state: "active" },
  { code: "en-CA", country: "Canada", path: "/en-ca", currency: "CAD ($)", tax: "Dynamic Provincial", fallback: "en-US", catalog: "NA Cross-Border", state: "staging" },
];

const FOREX = [
  { source: "ECB Forex Stream", desc: "European Central Bank hourly benchmark sync.", footer: ["Status: Validated", "4m ago"] },
  { source: "Nearest .00 Standard", desc: "Options: Round up to .00 or .95 psych markers.", footer: ["Active: .00 Ceiling", "Modify"] },
  { source: "+2.50% FX Buffer", desc: "Volatile rate fluctuation risk protection on localized catalogs.", footer: ["Coverage: 14 currencies", "Adjust"] },
];

export function LocalesView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/settings");
  const settings = (data ? firstArray(data) : [])[0] || {};

  return (
    <Shell
      title="Regional Locales & Currency Matrix"
      actions={
        <>
          <ActionBtn icon={Plus}>Add Target Region</ActionBtn>
          <ActionBtn icon={RefreshCw}>Sync Forex Rates</ActionBtn>
          <ActionBtn icon={Globe}>Test Geo-IP Routing</ActionBtn>
        </>
      }
    >
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Primary root */}
        <div
          style={{
            border: `1px solid ${T.line}`,
            borderRadius: 10,
            background: T.faint,
            padding: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--card)",
                border: `1px solid ${T.line}`,
                color: T.ink,
                display: "grid",
                placeItems: "center",
              }}
            >
              <Globe size={18} />
            </div>
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Primary Canonical Root: en-US</span>
                <Chip tone="ok">Default Active Fallback</Chip>
              </div>
              <p style={{ fontSize: 12, color: T.subtle, margin: "4px 0 0" }}>
                United States - USD ($) • Zero path prefix:{" "}
                <code style={{ fontFamily: "monospace", background: "var(--card)", padding: "1px 6px", borderRadius: 4, border: `1px solid ${T.line}` }}>/</code>
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted }}>Tax Calculation</div>
              <div style={{ fontSize: 12, color: T.ink }}>Exclusive (Calculated at checkout)</div>
            </div>
            <ActionBtn>Configure</ActionBtn>
          </div>
        </div>

        {/* Locale cards */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>
              Configured Storefront Locales · {LOCALES.length} Active Targets
            </span>
            <span style={{ fontSize: 11, color: T.muted }}>Drag to set priority cascade</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {LOCALES.map((l) => (
              <div
                key={l.code}
                style={{
                  border: `1px solid ${T.line}`,
                  borderRadius: 10,
                  background: "var(--card)",
                  padding: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ color: T.muted, marginTop: 2 }}><Menu size={14} /></span>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{l.code}</span>
                      <span style={{ fontSize: 12, color: T.body }}>{l.country}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 11, background: T.faint, padding: "2px 8px", borderRadius: 4, color: T.body }}>{l.path}</span>
                      <Chip tone={l.state === "active" ? "ok" : "info"}>{l.state === "active" ? "ENABLED" : "IN STAGING"}</Chip>
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: T.body, flexWrap: "wrap" }}>
                      <span>Currency: <strong style={{ color: T.ink, fontWeight: 600 }}>{l.currency}</strong></span>
                      <span>Tax: <strong style={{ color: T.ink, fontWeight: 600 }}>{l.tax}</strong></span>
                      <span>Fallback: <strong style={{ color: T.ink, fontWeight: 600 }}>{l.fallback}</strong></span>
                      <span>Catalog: <strong style={{ color: T.ink, fontWeight: 600 }}>{l.catalog}</strong></span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <ActionBtn>Edit Region</ActionBtn>
                  <ActionBtn>Manage Catalogs</ActionBtn>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Forex engine */}
        <Panel
          title="Currency Exchange & Realtime Forex Engine"
          subtitle="Hourly cron sync against ECB benchmark rates"
          icon={Tag}
          right={<Chip mono>CRON: HOURLY_SYNC</Chip>}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {FOREX.map((f) => (
              <div key={f.source} style={{ background: T.faint, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted, marginBottom: 4 }}>Forex Source Provider</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{f.source}</div>
                  <p style={{ fontSize: 11, color: T.subtle, marginTop: 4, lineHeight: 1.5 }}>{f.desc}</p>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "monospace", color: T.muted, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
                  <span>{f.footer[0]}</span>
                  <span style={{ color: T.ink, fontWeight: 600 }}>{f.footer[1]}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Geo-IP simulation */}
        <Panel
          title="Geo-IP Simulation & Storefront Preview"
          subtitle="Edge Worker resolves the visitor's IP and rewrites the canonical root URL"
          icon={Globe}
        >
          {loading && <LoadingRow />}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, fontWeight: 700 }}>Simulated IP Address</label>
              <input defaultValue="203.0.113.42" style={inputStyle} />
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, fontWeight: 700 }}>Detected Region</label>
              <input readOnly value="en-GB · United Kingdom · GBP" style={inputStyle} />
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, fontWeight: 700 }}>Rewritten Canonical URL</label>
              <input readOnly value="https://sunnyapparel.com/en-gb" style={inputStyle} />
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                Current tenant: {settings.brand_name || "UnSaid Memories"} · {settings.default_currency || "USD"}
              </div>
            </div>
            <div
              style={{
                background: "var(--foreground)",
                color: "var(--primary-foreground)",
                borderRadius: 10,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".18em" }}>SUNNY</div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>United Kingdom Storefront</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--muted-foreground)" }}>£ GBP · 20% VAT incl.</div>
              <button
                style={{
                  marginTop: 8,
                  padding: "6px 14px",
                  background: T.primary,
                  color: "var(--primary-foreground)",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Visit Storefront →
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </Shell>
  );
}

// ============================================================================
// 9. STOREFRONT ENGINE & CANONICAL SEO
//    view=storefront-engine
// ============================================================================
export function StorefrontEngineView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/settings");
  const s = (data ? firstArray(data) : [])[0] || {};

  return (
    <Shell
      title="Storefront Engine & Canonical SEO"
      actions={
        <>
          <ActionBtn icon={Check}>Validate Directives</ActionBtn>
          <ActionBtn icon={Save} primary>Save Global Settings</ActionBtn>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 0 }}>
        {/* LEFT — config engine */}
        <div style={{ padding: 24, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel
            title="Identity & Formula Patterns"
            subtitle="RULE_TIER_0 · supported tokens: %title%, %category%, %price%"
            icon={FileText}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel}>Title Formula (Interpolated) · MAX 60 CH</label>
                <input defaultValue="%title% | Sunny Apparel Co." style={inputStyle} />
              </div>
              <div>
                <label style={fieldLabel}>Canonical Store URL · FQDN REQUIRED</label>
                <input defaultValue="https://sunnyapparel.com" style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={fieldLabel}>Global Meta Description Fallback · 132 / 160</label>
              <textarea
                defaultValue="Modern utilitarian essentials designed for high-movement daily life. Responsibly sourced performance textiles and architectural tailoring."
                style={{ ...inputStyle, height: 60, fontFamily: "inherit", paddingTop: 8 }}
              />
            </div>
          </Panel>

          <Panel
            title="OpenGraph & Social Distribution Card"
            subtitle="Twitter, Facebook, iMessage rich preview payload"
            icon={ExternalLink}
            right={<ActionBtn icon={RefreshCw}>Sync Card</ActionBtn>}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
              <div>
                <label style={fieldLabel}>og:site_name</label>
                <input defaultValue="Sunny Apparel Studio" style={inputStyle} />
              </div>
              <div>
                <label style={fieldLabel}>twitter:site handle</label>
                <input defaultValue="@sunnyapparel" style={inputStyle} />
              </div>
            </div>
            <label style={fieldLabel}>og:image (CDN Ingestion Node)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input defaultValue="https://cdn.sunnyapparel.com/media/hero_brand_share_1200x630.jpg" style={{ ...inputStyle, flex: 1 }} />
              <ActionBtn icon={ImageIcon}>Asset Library</ActionBtn>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 11, color: T.muted }}>
              <span>1200x630 px</span>•<span>WebP / JPEG</span>•<span>184 KB</span>
            </div>
          </Panel>

          <Panel
            title="Robots.txt Directives & Sitemap Generation"
            subtitle="8 rules configured · SERVE_DYNAMIC"
            icon={Shield}
          >
            <label style={fieldLabel}>Robots.txt Directives Editor</label>
            <textarea
              defaultValue={`User-agent: *
Disallow: /checkout/
Disallow: /account/
Disallow: /admin/
Disallow: /cart/
Allow: /api/public/storefront/
Sitemap: https://sunnyapparel.com/sitemap.xml
Host: sunnyapparel.com`}
              style={{
                width: "100%",
                background: T.faint,
                border: `1px solid ${T.line}`,
                borderRadius: 6,
                padding: 10,
                fontFamily: "monospace",
                fontSize: 11,
                color: T.ink,
                height: 110,
                resize: "none",
              }}
            />
            <div
              style={{
                marginTop: 10,
                padding: 12,
                background: T.faint,
                borderRadius: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Toggle on />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>Dynamic Multi-index Sitemap.xml Engine</div>
                  <div style={{ fontSize: 11, color: T.subtle }}>Auto-compiles PDP, PLP, and editorial URLs into index shards capped at 25,000 URLs per sub-index.</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ fontSize: 11, color: T.muted }}>Recrawl Frequency:</label>
                <select style={inputStyle}>
                  <option>Hourly (Active Store)</option>
                  <option>Every 6 Hours</option>
                  <option>Daily</option>
                  <option>On Manual Deployment</option>
                </select>
              </div>
            </div>
          </Panel>

          <Panel
            title="Structured Data (JSON-LD WebSite & Organization)"
            subtitle="application/ld+json"
            icon={Code2}
          >
            <pre
              style={{
                background: T.faint,
                border: `1px solid ${T.line}`,
                borderRadius: 8,
                padding: 12,
                fontFamily: "monospace",
                fontSize: 11,
                color: T.ink,
                margin: 0,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
              }}
            >{`{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://sunnyapparel.com/#organization",
      "name": "Sunny Apparel Co.",
      "url": "https://sunnyapparel.com",
      "logo": "https://cdn.sunnyapparel.com/brand/logo-monochrome.svg",
      "sameAs": [
        "https://instagram.com/sunnyapparel",
        "https://twitter.com/sunnyapparel"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://sunnyapparel.com/#website",
      "url": "https://sunnyapparel.com",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://sunnyapparel.com/search?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    }
  ]
}`}</pre>
          </Panel>
        </div>

        {/* RIGHT — inspector */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel
            title="Lighthouse Technical Audit"
            subtitle="EDGE_SIMULATION_V4 · 24 of 24 audits passing"
            icon={Gauge}
            right={<Chip tone="ok">PASSING</Chip>}
          >
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: `conic-gradient(${T.primary} 0% 98%, ${T.faint} 98% 100%)`,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "var(--card)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: T.ink }}>98</div>
                    <div style={{ fontSize: 8, color: T.muted }}>/100</div>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>SEO Quality Benchmark</div>
                <div style={{ fontSize: 12, color: T.subtle }}>Passing 24 of 24 Core Storefront Audits</div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                ["Missing Image Alt Attributes", "0 detected (43 Checked)"],
                ["Canonical Loop Resolution", "Valid (200 OK Edge)"],
                ["Structured Schema Validity", "Valid (0 Warnings)"],
                ["Mobile Viewport Framing", "Configured (390px)"],
                ["HTTPS Enforced", "Strict TLS 1.3"],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.faint}`, fontSize: 12 }}>
                  <span style={{ color: T.ink, display: "flex", alignItems: "center", gap: 6 }}>
                    <Check size={14} style={{ color: T.primary }} />
                    {label}
                  </span>
                  <span style={{ fontFamily: "monospace", color: T.body }}>{val}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Google Search SERP Preview" subtitle="Title, URL, snippet rendering" icon={Search}>
            <div style={{ background: "var(--card)", border: `1px solid ${T.line}`, borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 12, color: T.muted }}>sunnyapparel.com › collections › new-arrivals</div>
              <div style={{ fontSize: 16, color: "var(--primary)", fontWeight: 500, marginTop: 2 }}>
                New Arrivals | Sunny Apparel Co.
              </div>
              <div style={{ fontSize: 12, color: T.body, marginTop: 4, lineHeight: 1.5 }}>
                Modern utilitarian essentials designed for high-movement daily life. Responsibly sourced performance textiles and architectural tailoring.
              </div>
            </div>
          </Panel>

          <Panel title="Social & iMessage Rich Preview" subtitle="OpenGraph card mock" icon={ExternalLink}>
            <div style={{ border: `1px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ aspectRatio: "1.91 / 1", background: T.faint, display: "grid", placeItems: "center" }}>
                <ImageIcon size={36} style={{ color: T.muted }} />
              </div>
              <div style={{ padding: 12, background: T.faint }}>
                <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase" }}>SUNNYAPPAREL.COM</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Precision Crafted Activewear for High Performance</div>
                <div style={{ fontSize: 11, color: T.subtle, marginTop: 2 }}>Engineered with breathable recycled fabrics.</div>
              </div>
            </div>
            {loading && <LoadingRow />}
            {!loading && (
              <div style={{ marginTop: 10, fontSize: 11, color: T.muted }}>
                Tenant brand: <strong style={{ color: T.ink }}>{s.brand_name || "UnSaid Memories"}</strong> · canonical{" "}
                <strong style={{ color: T.ink }}>{s.canonical_origin || "—"}</strong>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".1em",
  color: T.subtle,
  marginBottom: 4,
};

// ============================================================================
// 10. COMPONENT PROP VALIDATORS & STOREFRONT CONTRACTS
//    view=prop-validators
// ============================================================================
const CONTRACTS = [
  {
    id: "ct_01",
    name: "HeroSplitLookbook.tsx",
    version: "4.2.0",
    sha: "4ef90a",
    props: 6,
    mode: "STRICT_REJECT",
    required: ["headline", "eyebrow_token", "media_asset"],
    fallback: "default_hero_v4.json",
    integrity: "100% Validated",
    selected: true,
  },
  {
    id: "ct_02",
    name: "ProductGridCarousel.tsx",
    version: "3.5.1",
    sha: "9b12cc",
    props: 8,
    mode: "PERMISSIVE_WARN",
    required: ["collection_handle", "max_items"],
    fallback: "mock_carousel.json",
    integrity: "Active Sync",
  },
  {
    id: "ct_03",
    name: "EditorialHotspotSlider.tsx",
    version: "2.9.0",
    sha: "139fa4",
    props: 5,
    mode: "STRICT_REJECT",
    required: ["hotspot_coords[]", "bg_image"],
    fallback: "static_banner.webp",
    integrity: "Active Sync",
  },
  {
    id: "ct_04",
    name: "TwoColumnTextMedia.tsx",
    version: "4.0.0",
    sha: "aa055d",
    props: 4,
    mode: "STRICT_REJECT",
    required: ["copy_markdown", "alignment"],
    fallback: "empty_state.json",
    integrity: "Active Sync",
  },
];

export function PropValidatorsView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/blocks");
  const blocks: any[] = data ? firstArray(data) : [];
  const [selected, setSelected] = useState(CONTRACTS[0].id);
  const active = CONTRACTS.find((c) => c.id === selected) || CONTRACTS[0];

  return (
    <Shell
      title="Component Prop Validators & Storefront Contracts"
      actions={
        <>
          <ActionBtn icon={Filter}>Filter Mode</ActionBtn>
          <ActionBtn icon={Plus} primary>Register Contract</ActionBtn>
        </>
      }
    >
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Contracts matrix */}
        <Panel
          title="Registered Component Contracts"
          subtitle={`${CONTRACTS.length} Modules Loaded`}
          icon={Code2}
          noPad
        >
          {loading && <LoadingRow />}
          <DataTable
            headers={["Component Spec", "Mode & Props", "Mandatory Fields", "Hydration Fallback", "Integrity"]}
            items={CONTRACTS}
            renderRow={(c) => (
              <>
                <Td>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.selected ? T.primary : T.idle }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: T.muted }}>Version {c.version} · SHA: {c.sha}</div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <div style={{ fontSize: 11, color: T.ink, fontWeight: 600 }}>{c.props} Defined Props</div>
                  <Chip tone={c.mode === "STRICT_REJECT" ? "ok" : "info"} mono>{c.mode}</Chip>
                </Td>
                <Td>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {c.required.map((r) => (
                      <span key={r} style={{ padding: "2px 6px", background: T.faint, borderRadius: 4, fontFamily: "monospace", fontSize: 11, color: T.body }}>{r}</span>
                    ))}
                  </div>
                </Td>
                <Td>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", fontFamily: "monospace", fontSize: 11, color: T.body }}>
                    <FileText size={12} />
                    {c.fallback}
                  </div>
                </Td>
                <Td align="right">
                  <Chip tone={c.integrity.includes("100%") ? "ok" : "idle"}>{c.integrity}</Chip>
                </Td>
              </>
            )}
          />
        </Panel>

        {/* Rule editor */}
        <Panel
          title="Validation Rule Details Editor"
          subtitle={`Targeting Schema: ${active.name} (Zod v3 Node Tree) · Strict Mode Active`}
          icon={Wrench}
          right={<ActionBtn icon={Plus}>Add Prop Rule</ActionBtn>}
        >
          <div
            style={{
              background: T.faint,
              borderRadius: 8,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", background: "var(--card)", padding: "2px 8px", borderRadius: 4, fontWeight: 700, color: T.ink, fontSize: 12 }}>
                  prop: 'headline'
                </span>
                <span style={{ fontSize: 11, color: T.body }}>Primitive Type: <strong style={{ color: T.ink }}>String</strong></span>
                <Chip tone="ok">Required</Chip>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Toggle on />
                <button style={iconBtn}><MoreHorizontal size={12} /></button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              <ConstraintBox label="Length Bounds" value="min: 4 | max: 64" />
              <ConstraintBox label="Regex Constraint" value="/^[A-Z0-9].*/" wide />
              <ConstraintBox label="Forbidden Tokens" value="html, script" />
              <ConstraintBox label="Fallback Default" value='"Curated Luxury Essentials"' />
            </div>
          </div>

          <div style={{ marginTop: 10, background: T.faint, borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", background: "var(--card)", padding: "2px 8px", borderRadius: 4, fontWeight: 700, color: T.ink, fontSize: 12 }}>
                  prop: 'media_asset'
                </span>
                <span style={{ fontSize: 11, color: T.body }}>Type: <strong style={{ color: T.ink }}>relationship → MediaLibrary</strong></span>
                <Chip tone="ok">Required</Chip>
              </div>
              <Toggle on />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 10 }}>
              <ConstraintBox label="MIME Constraint" value="webp, avif" />
              <ConstraintBox label="Resolves Entity" value="cdn.sunnyapparel.com/assets/*" wide />
              <ConstraintBox label="Min Resolution" value="1600x1200" />
              <ConstraintBox label="Max Filesize" value="3.2 MB" />
            </div>
          </div>
        </Panel>

        {/* Live assertion runner */}
        <Panel
          title="Props Live Assertion Runner"
          subtitle="Inject a sample payload and observe contract resolution"
          icon={Activity}
          right={
            <>
              <select value={selected} onChange={(e) => setSelected(e.target.value)} style={inputStyle}>
                {CONTRACTS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ActionBtn icon={Zap} primary>Run Assertion</ActionBtn>
            </>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={fieldLabel}>Sample JSON Payload</label>
              <textarea
                defaultValue={`{
  "headline": "Curated Luxury Essentials",
  "eyebrow_token": "seasonal_drop",
  "media_asset": "cdn/sunnyapparel/hero_fw25.webp"
}`}
                style={{
                  width: "100%",
                  background: "var(--foreground)",
                  color: "var(--muted)",
                  border: `1px solid ${T.line}`,
                  borderRadius: 8,
                  padding: 10,
                  fontFamily: "monospace",
                  fontSize: 11,
                  height: 140,
                  resize: "none",
                }}
              />
            </div>
            <div>
              <label style={fieldLabel}>Assertion Result</label>
              <div style={{ background: T.primaryTint, borderRadius: 8, padding: 14, height: 140, overflowY: "auto" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, marginBottom: 6 }}>
                  <CheckCircle2 size={14} style={{ color: T.primary }} />
                  <span style={{ color: T.ink, fontWeight: 700 }}>3 props validated</span>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: T.body }}>
                  ✓ headline (string) — length 26/64, matches regex<br />
                  ✓ eyebrow_token (string) — required<br />
                  ✓ media_asset (relationship) — resolves<br />
                  ─── 0 errors, 0 warnings ───
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: T.muted }}>
            {blocks.length} content blocks currently reference this contract.
          </div>
        </Panel>
      </div>
    </Shell>
  );
}

function ConstraintBox({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: 6, padding: 10, gridColumn: wide ? "span 2" : undefined }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: T.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ============================================================================
// 11. CONTENT BLOCKS JSON SCHEMA & NODE DEFINITIONS
//    view=block-schemas
// ============================================================================
const SCHEMA_FIELDS = [
  { key: "title", type: "string", required: true, max: "max: 80 chars", default: '"Curated Luxury Essentials"', widget: "ui:widget: textfield" },
  { key: "subtitle", type: "string", required: false, max: "max: 160 chars", default: "No fallback default configured", widget: "ui:widget: textarea" },
  { key: "media_asset", type: "relationship -> MediaLibrary", required: true, max: "mime: webp, avif", default: "Resolves entity target: cdn.sunnyapparel.com/assets/*", widget: "min_res: 1600x1200" },
  { key: "cta_primary", type: "group (object)", required: true, max: "3 nested keys", default: "Nested fields: label, href, variant", widget: "ui:widget: group" },
  { key: "analytics_metadata", type: "group (object)", required: false, max: "2 nested keys", default: "Optional tracking envelope", widget: "ui:widget: group" },
];

export function BlockSchemasView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/blocks");
  const blocks: any[] = data ? firstArray(data) : [];
  const [tab, setTab] = useState<"visual" | "code">("visual");

  return (
    <Shell
      title="Content Blocks JSON Schema & Node Definitions"
      actions={<ActionBtn icon={Plus} primary>New Schema Node</ActionBtn>}
    >
      {/* Active schema selector */}
      <div
        style={{
          padding: "12px 24px",
          background: T.faint,
          borderBottom: `1px solid ${T.line}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Code2 size={16} style={{ color: T.muted }} />
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted, fontFamily: "monospace" }}>Active Target Schema</div>
            <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: T.ink }}>Hero_Split_Lookbook_v2.schema.json</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Chip mono>24.8 KB</Chip>
          <Chip tone="ok" mono>0 Schema Errors</Chip>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 24,
          padding: "0 24px",
          borderBottom: `1px solid ${T.line}`,
          background: "var(--card)",
        }}
      >
        <button
          onClick={() => setTab("visual")}
          style={{
            padding: "10px 0",
            fontSize: 12,
            fontWeight: tab === "visual" ? 700 : 500,
            color: tab === "visual" ? T.ink : T.muted,
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            borderBottom: `2px solid ${tab === "visual" ? T.primary : "transparent"}`,
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <ListTree size={14} /> Visual Field Modeler (5 fields)
        </button>
        <button
          onClick={() => setTab("code")}
          style={{
            padding: "10px 0",
            fontSize: 12,
            fontWeight: tab === "code" ? 700 : 500,
            color: tab === "code" ? T.ink : T.muted,
            border: "none",
            borderBottom: `2px solid ${tab === "code" ? T.primary : "transparent"}`,
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <Code2 size={14} /> TypeScript & Zod Schema
        </button>
      </div>

      <div style={{ padding: 24 }}>
        {tab === "visual" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {SCHEMA_FIELDS.map((f) => (
              <div
                key={f.key}
                style={{
                  border: `1px solid ${T.line}`,
                  borderRadius: 8,
                  background: "var(--card)",
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Menu size={14} style={{ color: T.muted, cursor: "grab" }} />
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: T.ink }}>{f.key}</span>
                    <span style={{ padding: "1px 6px", background: T.faint, borderRadius: 4, fontFamily: "monospace", fontSize: 10, color: T.body }}>{f.type}</span>
                    {f.required ? (
                      <Chip tone="ok">REQUIRED</Chip>
                    ) : (
                      <Chip>OPTIONAL</Chip>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>{f.max}</span>
                    <button style={iconBtn}><Edit3 size={12} /></button>
                    <button style={iconBtn}><MoreHorizontal size={12} /></button>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.faint}`, fontSize: 11, color: T.body }}>
                  <span style={{ fontStyle: f.default.includes("No fallback") ? "italic" : undefined, color: f.default.includes("No fallback") ? T.muted : T.body }}>
                    Default: <span style={{ fontFamily: "monospace", color: T.ink }}>{f.default}</span>
                  </span>
                  <span style={{ fontFamily: "monospace", color: T.muted }}>{f.widget}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Panel title="TypeScript & Zod Schema" subtitle="Generated from visual modeler" icon={Code2} noPad>
            <pre
              style={{
                padding: 16,
                fontFamily: "monospace",
                fontSize: 11,
                color: T.ink,
                margin: 0,
                whiteSpace: "pre-wrap",
                background: T.faint,
              }}
            >{`import { z } from "zod";

export const HeroSplitLookbookSchema = z.object({
  title: z.string().min(4).max(80).regex(/^[A-Z0-9].*/),
  subtitle: z.string().max(160).optional(),
  media_asset: z.string().url().refine(
    (url) => url.startsWith("https://cdn.sunnyapparel.com/assets/"),
    { message: "Must resolve to CDN assets path" }
  ),
  cta_primary: z.object({
    label: z.string().min(2).max(40),
    href: z.string().startsWith("/"),
    variant: z.enum(["primary", "secondary", "ghost"]).default("primary"),
  }),
  analytics_metadata: z.object({
    event_name: z.string().optional(),
    payload: z.record(z.unknown()).optional(),
  }).optional(),
});

export type HeroSplitLookbookProps = z.infer<typeof HeroSplitLookbookSchema>;`}</pre>
          </Panel>
        )}

        {/* Dry-Run Playground */}
        <div style={{ marginTop: 18 }}>
          <Panel
            title="Dry-Run Playground"
            subtitle="Inject payload and observe compiled output"
            icon={Sparkles}
            right={<ActionBtn icon={Zap} primary>Execute</ActionBtn>}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel}>Input JSON</label>
                <textarea
                  defaultValue={`{
  "title": "Curated Luxury Essentials",
  "subtitle": "Architectural pieces for everyday ritual.",
  "media_asset": "https://cdn.sunnyapparel.com/assets/hero_fw25.webp",
  "cta_primary": {
    "label": "Explore Drop",
    "href": "/collections/new-arrivals",
    "variant": "primary"
  }
}`}
                  style={{
                    width: "100%",
                    height: 200,
                    background: "var(--foreground)",
                    color: "var(--muted)",
                    border: `1px solid ${T.line}`,
                    borderRadius: 8,
                    padding: 10,
                    fontFamily: "monospace",
                    fontSize: 11,
                    resize: "none",
                  }}
                />
              </div>
              <div>
                <label style={fieldLabel}>Compiled Output Preview</label>
                <div style={{ border: `1px solid ${T.line}`, borderRadius: 8, padding: 14, background: "var(--card)", height: 200, overflowY: "auto" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>Curated Luxury Essentials</div>
                  <div style={{ fontSize: 11, color: T.subtle, marginTop: 2 }}>Architectural pieces for everyday ritual.</div>
                  <div style={{ marginTop: 10, padding: "6px 12px", background: T.primary, color: "var(--primary-foreground)", borderRadius: 6, fontSize: 11, fontWeight: 700, display: "inline-block" }}>
                    Explore Drop →
                  </div>
                </div>
              </div>
            </div>
            {loading && <LoadingRow />}
            {!loading && (
              <div style={{ marginTop: 10, fontSize: 11, color: T.muted }}>
                {blocks.length} content blocks currently use this schema.
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

// ============================================================================
// 12. CONTENT BLOCKS SLOT CATALOG
//    view=slot-catalog
// ============================================================================
const SLOTS = [
  {
    category: "Hero Section Blocks",
    slot: "@storefront/viewport-top",
    items: [
      { id: "s_01", name: "Hero Split Lookbook", version: "v4.2", desc: "50/50 structured layout with left programmatic typography and right visual aspect container.", slots: 4, used: 8, selected: true },
      { id: "s_02", name: "Minimalist Hero Banner", version: "v3.8", desc: "Full-bleed centered title, modular subtitle tokens, and multi-action callout group.", slots: 2, used: 14 },
      { id: "s_03", name: "Video Billboard", version: "v4.0", desc: "Background video streaming container with muted autoplay, telemetry overlay, and scrim.", slots: 3, used: 3 },
    ],
  },
  {
    category: "Product Carousels",
    slot: "@storefront/secondary-rail",
    items: [
      { id: "s_04", name: "Grid 4-up Carousel", version: "v3.5", desc: "Responsive 4-column product carousel with hover zoom and quick-add drawer trigger.", slots: 4, used: 22 },
      { id: "s_05", name: "Editorial Hotspot Slider", version: "v2.9", desc: "Imagemap-driven editorial slider with annotated product hotspots and CTA pins.", slots: 5, used: 4 },
    ],
  },
  {
    category: "Content Modules",
    slot: "@storefront/interstitial",
    items: [
      { id: "s_06", name: "Two-Column Text & Image", version: "v4.0", desc: "Editorial copy block paired with a media column supporting alignment variants.", slots: 3, used: 18 },
      { id: "s_07", name: "Quote Pull", version: "v2.4", desc: "Large-format typographic pull-quote with attribution and source link.", slots: 2, used: 7 },
      { id: "s_08", name: "Editorial Lookbook Grid", version: "v3.2", desc: "Asymmetric 3-row lookbook grid with caption overlays and lazy-loaded imagery.", slots: 6, used: 5 },
    ],
  },
];

export function SlotCatalogView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/blocks");
  const blocks: any[] = data ? firstArray(data) : [];
  const [filter, setFilter] = useState<"all" | "hero" | "carousel" | "editorial">("all");
  const [selected, setSelected] = useState("s_01");

  const filtered = SLOTS.filter((s) => {
    if (filter === "all") return true;
    if (filter === "hero") return s.category.includes("Hero");
    if (filter === "carousel") return s.category.includes("Carousel");
    if (filter === "editorial") return s.category.includes("Editorial") || s.category.includes("Content");
    return true;
  });

  return (
    <Shell
      title="Content Blocks Slot Catalog"
      actions={
        <>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search size={14} style={{ position: "absolute", left: 10, color: T.muted }} />
            <input placeholder="Search layout slots, tags, props..." style={{ ...inputStyle, paddingLeft: 30, width: 240 }} />
          </div>
          <ActionBtn icon={Plus} primary>Register Slot</ActionBtn>
        </>
      }
    >
      {/* Category filter strip */}
      <div
        style={{
          padding: "12px 24px",
          borderBottom: `1px solid ${T.line}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 11, color: T.muted, alignSelf: "center" }}>Category:</span>
          {[
            { k: "all", label: "All (8)" },
            { k: "hero", label: "Hero (3)" },
            { k: "carousel", label: "Carousel (2)" },
            { k: "editorial", label: "Editorial (3)" },
          ].map((b) => (
            <button
              key={b.k}
              onClick={() => setFilter(b.k as any)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                borderRadius: 6,
                border: "none",
                background: filter === b.k ? T.primary : T.faint,
                color: filter === b.k ? "var(--card)" : T.body,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
        {loading && <span style={{ fontSize: 11, color: T.muted }}>Syncing {blocks.length} blocks…</span>}
      </div>

      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
        {filtered.map((cat) => (
          <div key={cat.category}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{cat.category}</span>
                <Chip>{cat.items.length} items</Chip>
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: T.muted }}>SLOT: {cat.slot}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {cat.items.map((slot) => {
                const isSelected = selected === slot.id;
                return (
                  <button
                    key={slot.id}
                    onClick={() => setSelected(slot.id)}
                    style={{
                      textAlign: "left",
                      border: isSelected ? `1px solid ${T.primary}` : `1px solid ${T.line}`,
                      borderRadius: 10,
                      background: "var(--card)",
                      padding: 14,
                      cursor: "pointer",
                      boxShadow: isSelected ? `0 0 0 3px ${T.primaryTint}` : "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      position: "relative",
                    }}
                  >
                    {isSelected && (
                      <div style={{ position: "absolute", top: 8, right: 8 }}>
                        <Chip tone="ok" mono>SELECTED</Chip>
                      </div>
                    )}
                    {/* Wireframe thumbnail */}
                    <div
                      style={{
                        height: 96,
                        background: T.faint,
                        borderRadius: 6,
                        padding: 8,
                        display: "grid",
                        gridTemplateColumns: slot.name.includes("Split") ? "5fr 7fr" : "1fr",
                        gap: 4,
                      }}
                    >
                      {slot.name.includes("Split") ? (
                        <>
                          <div style={{ background: T.chip, borderRadius: 4, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, padding: 4 }}>
                            <div style={{ height: 6, background: T.muted, borderRadius: 2, width: "70%" }} />
                            <div style={{ height: 3, background: T.line, borderRadius: 2, width: "100%" }} />
                            <div style={{ height: 8, width: 24, background: T.primary, borderRadius: 2 }} />
                          </div>
                          <div style={{ background: T.chip, borderRadius: 4 }} />
                        </>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: 4 }}>
                          <div style={{ height: 8, background: T.muted, borderRadius: 2, width: "50%" }} />
                          <div style={{ height: 4, background: T.line, borderRadius: 2, width: "70%" }} />
                          <div style={{ display: "flex", gap: 4 }}>
                            <div style={{ height: 8, width: 22, background: T.primary, borderRadius: 2 }} />
                            <div style={{ height: 8, width: 22, background: T.chip, borderRadius: 2 }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{slot.name}</span>
                        <Chip mono>{slot.version}</Chip>
                      </div>
                      <p style={{ fontSize: 11, color: T.subtle, margin: "4px 0 0", lineHeight: 1.4 }}>{slot.desc}</p>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${T.faint}`, fontSize: 11, color: T.muted }}>
                      <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <Layout size={12} /> {slot.slots} Dynamic Slots
                      </span>
                      <span>Used on {slot.used} pages</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Detail inspector */}
        <Panel
          title="Slot Inspector"
          subtitle={SLOTS.flatMap((s) => s.items).find((i) => i.id === selected)?.name || "—"}
          icon={Eye}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={fieldLabel}>Slot Identifier</label>
              <input readOnly value={selected} style={inputStyle} />
              <label style={{ ...fieldLabel, marginTop: 10 }}>Available Bindings</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                <div style={{ padding: "4px 8px", background: T.faint, borderRadius: 4, fontFamily: "monospace", color: T.body }}>@storefront/viewport-top</div>
                <div style={{ padding: "4px 8px", background: T.faint, borderRadius: 4, fontFamily: "monospace", color: T.body }}>@storefront/secondary-rail</div>
                <div style={{ padding: "4px 8px", background: T.faint, borderRadius: 4, fontFamily: "monospace", color: T.body }}>@storefront/interstitial</div>
              </div>
            </div>
            <div>
              <label style={fieldLabel}>Registered Content Blocks ({blocks.length})</label>
              <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {blocks.length === 0 ? (
                  <EmptyState msg="No content blocks bound." />
                ) : (
                  blocks.slice(0, 8).map((b: any) => (
                    <div
                      key={b.id}
                      style={{
                        padding: "6px 10px",
                        background: T.faint,
                        borderRadius: 6,
                        fontSize: 11,
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontFamily: "monospace", color: T.ink }}>{b.block_id}</span>
                      <span style={{ color: T.muted }}>{b.component_type}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </Shell>
  );
}

// ============================================================================
// 13. FOOTER COLUMNS & UTILITY NAVIGATION BUILDER
//    view=footer-builder
// ============================================================================
const FOOTER_COLS = [
  {
    id: "col_01",
    title: "Shop & Categories",
    links: [
      { idx: "01", label: "Men", href: "/category/men" },
      { idx: "02", label: "Women", href: "/category/women" },
      { idx: "03", label: "Accessories", href: "/category/accessories" },
      { idx: "04", label: "Tech Poplin", href: "/collection/tech-poplin" },
      { idx: "05", label: "Archive", href: "/archive" },
    ],
  },
  {
    id: "col_02",
    title: "About Sunny",
    links: [
      { idx: "01", label: "Our Story", href: "/about/story" },
      { idx: "02", label: "Sustainability Report", href: "/about/sustainability" },
      { idx: "03", label: "Supply Chain Transparency", href: "/about/supply-chain" },
      { idx: "04", label: "Press", href: "/press" },
    ],
  },
  {
    id: "col_03",
    title: "Client Service",
    links: [
      { idx: "01", label: "Order Status", href: "/services/order-status" },
      { idx: "02", label: "Shipping & Returns", href: "/services/shipping" },
      { idx: "03", label: "Size Guide", href: "/help/size-guide" },
      { idx: "04", label: "Contact Us", href: "/contact" },
      { idx: "05", label: "Help Center", href: "/help" },
    ],
  },
  {
    id: "col_04",
    title: "Legal & Compliance",
    links: [
      { idx: "01", label: "Terms of Service", href: "/legal/terms" },
      { idx: "02", label: "Privacy Policy", href: "/legal/privacy" },
      { idx: "03", label: "Cookie Preferences", href: "/legal/cookies" },
      { idx: "04", label: "Accessibility Statement", href: "/legal/accessibility" },
    ],
  },
];

export function FooterBuilderView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/navigation?location=footer&withItems=true");
  const menus: any[] = data ? firstArray(data) : [];

  return (
    <Shell
      title="Footer Columns & Utility Navigation Builder"
      actions={
        <>
          <ActionBtn icon={Plus}>+ Add Footer Column</ActionBtn>
          <ActionBtn icon={LinkIcon}>+ Add Link Node</ActionBtn>
          <ActionBtn icon={Save} primary>Save Footer Tree</ActionBtn>
        </>
      }
    >
      {/* Telemetry strip */}
      <div
        style={{
          padding: "12px 24px",
          background: T.faint,
          borderBottom: `1px solid ${T.line}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <CheckCircle2 size={18} style={{ color: T.ink }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>Node Graph Synthesized</div>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>18/18 live routes compiled</div>
          </div>
        </div>
        <Chip mono>SCHEMA v4.2</Chip>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 0 }}>
        {/* LEFT — column configurator */}
        <div style={{ padding: 24, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>
              Primary Columns Configurator
            </span>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>GRID: 4 COLS EQUAL</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {FOOTER_COLS.map((col) => (
              <div
                key={col.id}
                style={{
                  border: `1px solid ${T.line}`,
                  borderRadius: 10,
                  background: "var(--card)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Menu size={14} style={{ color: T.muted, cursor: "grab" }} />
                    <Chip mono>{col.id.toUpperCase()}</Chip>
                    <input
                      defaultValue={col.title}
                      style={{
                        height: 26,
                        padding: "0 8px",
                        background: T.faint,
                        border: `1px solid ${T.line}`,
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        color: T.ink,
                        width: 140,
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <Chip>{col.links.length} links</Chip>
                    <button style={iconBtn}><MoreHorizontal size={14} /></button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 8 }}>
                  {col.links.map((l) => (
                    <div
                      key={l.idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "4px 8px",
                        background: T.faint,
                        borderRadius: 4,
                        fontSize: 11,
                      }}
                    >
                      <span style={{ display: "flex", gap: 6, color: T.ink }}>
                        <span style={{ fontFamily: "monospace", color: T.muted }}>{l.idx}</span> {l.label}
                      </span>
                      <span style={{ fontFamily: "monospace", color: T.muted }}>{l.href}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Brand mission / Guild */}
          <Panel title="Brand Mission Block" subtitle="Curated Luxury Essentials" icon={Sparkles}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={fieldLabel}>Brand Tagline</label>
              <input defaultValue="Curated Luxury Essentials" style={inputStyle} />
              <label style={fieldLabel}>Guild Signup Headline</label>
              <input defaultValue="Join the Sunny Guild" style={inputStyle} />
              <label style={fieldLabel}>Guild Description</label>
              <textarea
                defaultValue="Members receive priority concierge, early capsule access, and trade-in credit on every order."
                style={{ ...inputStyle, height: 50, paddingTop: 8 }}
              />
            </div>
          </Panel>

          {menus.length > 0 && (
            <div style={{ padding: 12, background: T.faint, borderRadius: 8, fontSize: 11, color: T.body }}>
              Bound footer menu: <strong style={{ color: T.ink }}>{menus[0]?.name}</strong> · {menus[0]?.items?.length || 0} items
            </div>
          )}
          {loading && <LoadingRow />}
        </div>

        {/* RIGHT — quick stats */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MetricCard label="Total Columns" value={FOOTER_COLS.length} sub="Equal grid desktop" icon={Layout} />
            <MetricCard label="Total Links" value={FOOTER_COLS.reduce((acc, c) => acc + c.links.length, 0)} sub="Live routes compiled" icon={LinkIcon} />
          </div>

          <Panel title="Live Storefront Footer Preview" subtitle="Rendered at 1440px desktop viewport" icon={Eye}>
            <div style={{ background: "var(--foreground)", color: "var(--primary-foreground)", borderRadius: 10, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".18em", marginBottom: 12 }}>SUNNY APPAREL</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                {FOOTER_COLS.map((c) => (
                  <div key={c.id}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground)", marginBottom: 6 }}>{c.title}</div>
                    {c.links.slice(0, 3).map((l) => (
                      <div key={l.idx} style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 2 }}>{l.label}</div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ paddingTop: 12, borderTop: "1px solid color-mix(in srgb, var(--foreground) 88%, var(--primary))", fontSize: 10, color: "var(--muted-foreground)" }}>
                © 2026 Sunny Apparel Worldwide Inc. All rights reserved.
              </div>
            </div>
          </Panel>

          <Panel title="Footer Compliance Telemetry" icon={Shield}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["4ms CDN Edge", "JSON-LD Compliant", "AAA Contrast Ratio"],
                ["WCAG 2.2 AA", "GDPR / CCPA Covered", "Schema Valid"],
              ].flat().map((m) => (
                <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: T.faint, borderRadius: 6, fontSize: 12 }}>
                  <span style={{ color: T.ink }}>{m}</span>
                  <Check size={14} style={{ color: T.primary }} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

// ============================================================================
// 14. VOLUME TIER MATRIX & BUNDLE RULES
//    view=volume-tiers
// ============================================================================
const TIERS = [
  { seq: "#01", range: "Buy 2 Items", deduction: "10% OFF", type: "Percentage", label: "Pair Discovery" },
  { seq: "#02", range: "Buy 3–4 Items", deduction: "15% OFF", type: "Percentage", label: "Wardrobe Multiplier" },
  { seq: "#03", range: "Buy 5+ Items", deduction: "25% OFF", type: "Bulk Cap", label: "Commercial Wholesale", featured: true },
];

const STACKABILITY = [
  { title: "Voucher Code Concurrency", desc: "Cannot combine with checkout promotion code WELCOME10", on: true },
  { title: "Shipping Threshold Concurrency", desc: "Stackable with Free Shipping over $75 offer", on: true },
  { title: "VIP Member Discount Override", desc: "VIP 5% bonus stacks additively on top of volume tier", on: false },
  { title: "Wholesale Account Cap", desc: "Hard ceiling at 30% total cart reduction", on: true },
];

export function VolumeTiersView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/offers");
  const offers: any[] = data ? firstArray(data) : [];
  const [qty, setQty] = useState(2);
  const unitPrice = 180;
  const tier = TIERS.find((t) => {
    if (t.range.includes("2 Items")) return qty === 2;
    if (t.range.includes("3–4")) return qty >= 3 && qty <= 4;
    if (t.range.includes("5+")) return qty >= 5;
    return false;
  });
  const deduction = tier ? parseInt(tier.deduction) / 100 : 0;
  const subtotal = unitPrice * qty;
  const total = subtotal * (1 - deduction);

  return (
    <Shell
      title="Volume Tier Matrix & Bundle Rules"
      actions={
        <>
          <ActionBtn icon={Tag}>Promotions & Codes</ActionBtn>
          <ActionBtn icon={Package}>Cart Thresholds</ActionBtn>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 0 }}>
        {/* LEFT — config */}
        <div style={{ padding: 24, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Tier matrix */}
          <Panel
            title="Tier Quantity Matrix"
            subtitle="Configure multi-item unit reductions evaluated instantaneously at edge runtime"
            icon={Layers}
            right={<ActionBtn icon={Plus}>Add Volume Tier</ActionBtn>}
          >
            <div style={{ background: T.faint, borderRadius: 8, padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr 3fr 3fr 2fr", padding: "4px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle, fontWeight: 700 }}>
                <span>Seq</span>
                <span>Tier Range</span>
                <span>Unit Deduction</span>
                <span>Label Identifier</span>
                <span style={{ textAlign: "right" }}>Actions</span>
              </div>
              {TIERS.map((t) => (
                <div
                  key={t.seq}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 3fr 3fr 3fr 2fr",
                    alignItems: "center",
                    background: "var(--card)",
                    padding: "10px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                >
                  <span style={{ fontFamily: "monospace", color: T.muted }}>{t.seq}</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 600, color: T.ink }}>{t.range}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Chip tone={t.featured ? "ok" : "idle"} mono>{t.deduction}</Chip>
                    <span style={{ fontSize: 10, color: T.muted }}>({t.type})</span>
                  </div>
                  <span style={{ color: T.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                    <button style={iconBtn}><Settings size={12} /></button>
                    <button style={{ ...iconBtn, color: T.bad }}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Catalog scoping */}
          <Panel
            title="Catalog Scoping & Inclusions"
            subtitle="Taxonomy criteria directing which parent nodes consume this tiered matrix"
            icon={Package}
            right={<ActionBtn icon={Filter}>Exclusion Categories</ActionBtn>}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: T.faint, borderRadius: 8, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.ink }}>Included Collections (2)</span>
                  <CheckCircle2 size={14} style={{ color: T.primary }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["Outerwear Essentials", "Poplin Shirts"].map((c) => (
                    <span key={c} style={{ padding: "4px 8px", background: "var(--card)", borderRadius: 4, fontSize: 11, color: T.ink, display: "flex", alignItems: "center", gap: 4 }}>
                      {c}
                      <span style={{ color: T.muted, cursor: "pointer" }}>×</span>
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10, color: T.muted }}>SKU Matching: 148 items qualified</div>
              </div>
              <div style={{ background: T.faint, borderRadius: 8, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.ink }}>Explicit Exclusions (1)</span>
                  <TriangleAlert size={14} style={{ color: T.warn }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["Archival Capsules"].map((c) => (
                    <span key={c} style={{ padding: "4px 8px", background: "var(--card)", borderRadius: 4, fontSize: 11, color: T.ink, display: "flex", alignItems: "center", gap: 4 }}>
                      {c}
                      <span style={{ color: T.muted, cursor: "pointer" }}>×</span>
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10, color: T.muted }}>Bypasses wholesale discounting logic</div>
              </div>
            </div>
          </Panel>

          {/* Stackability */}
          <Panel
            title="Concurrency & Stackability Rules"
            subtitle="Prevent predatory double-dipping and enforce margin floor rules"
            icon={Shield}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {STACKABILITY.map((r) => (
                <div
                  key={r.title}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 14,
                    background: T.faint,
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: "var(--card)",
                        display: "grid",
                        placeItems: "center",
                        color: T.ink,
                      }}
                    >
                      <Shield size={14} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{r.title}</div>
                      <div style={{ fontSize: 11, color: T.subtle }}>{r.desc}</div>
                    </div>
                  </div>
                  <Toggle on={r.on} />
                </div>
              ))}
            </div>
          </Panel>

          {/* Linked offers */}
          <Panel title="Linked Promo Codes" subtitle={`${offers.length} offers bound to volume matrix`} icon={Tag}>
            {loading && <LoadingRow />}
            {offers.length === 0 ? (
              <EmptyState msg="No offers bound." />
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {offers.slice(0, 8).map((o: any) => (
                  <span
                    key={o.id}
                    style={{
                      padding: "4px 10px",
                      background: T.chip,
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: T.body,
                    }}
                  >
                    {o.code}
                  </span>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* RIGHT — calculator */}
        <div style={{ padding: 24 }}>
          <Panel
            title="Live PDP Volume Calculator"
            subtitle="Real-time preview of tier deduction at cart"
            icon={Activity}
          >
            <div
              style={{
                border: `1px solid ${T.line}`,
                borderRadius: 10,
                padding: 14,
                background: T.faint,
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 11, color: T.muted }}>Sample Product</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginTop: 2 }}>Heavyweight Studio Overshirt</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: T.subtle }}>Unit Price</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: "monospace" }}>${unitPrice.toFixed(2)}</span>
              </div>
            </div>

            <label style={fieldLabel}>Quantity</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                style={{ ...iconBtn, width: 32, height: 32 }}
              >−</button>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                style={{ ...inputStyle, textAlign: "center", flex: 1 }}
              />
              <button
                onClick={() => setQty(qty + 1)}
                style={{ ...iconBtn, width: 32, height: 32 }}
              >+</button>
            </div>

            {tier ? (
              <div style={{ padding: 12, background: T.primaryTint, borderRadius: 8, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.primary, fontWeight: 700 }}>
                  <span>Matched Tier: {tier.label}</span>
                  <Chip tone="ok" mono>{tier.deduction}</Chip>
                </div>
              </div>
            ) : (
              <div style={{ padding: 12, background: T.faint, borderRadius: 8, marginBottom: 12, fontSize: 11, color: T.muted }}>
                No tier matched — single-unit pricing
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: T.body }}>
                <span>Subtotal</span>
                <span style={{ fontFamily: "monospace" }}>${subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: T.bad }}>
                <span>Volume Deduction ({Math.round(deduction * 100)}%)</span>
                <span style={{ fontFamily: "monospace" }}>−${(subtotal - total).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${T.line}`, fontWeight: 700, color: T.ink }}>
                <span>Total</span>
                <span style={{ fontFamily: "monospace", fontSize: 18, color: T.primary }}>${total.toFixed(2)}</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

// ============================================================================
// 15. FALLBACK PAGES, ERROR HANDLING & URL REDIRECTS
//    view=fallback-pages
// ============================================================================
const FALLBACK_TEMPLATES = [
  { id: "fb_01", code: "404", name: "Not Found — Editorial Recovery", desc: "Hero image + 3 suggested collections + search prompt.", path: "/_error/404" },
  { id: "fb_02", code: "410", name: "Gone — Archived Capsule Notice", desc: "Explains capsule is retired and links to the active lookbook.", path: "/_error/410" },
  { id: "fb_03", code: "500", name: "Internal Error — Soft Recovery", desc: "Static fallback with cart preservation and retry CTA.", path: "/_error/500" },
  { id: "fb_04", code: "503", name: "Global Maintenance Window", desc: "Branded maintenance page with status page link.", path: "/_error/503" },
];

export function FallbackPagesView() {
  const { data: redirectsData, loading: redirectsLoading } = useFetch<any>("/api/admin/cms/redirects");
  const { data: pagesData, loading: pagesLoading } = useFetch<any>("/api/admin/cms/pages");
  const redirects: any[] = redirectsData ? firstArray(redirectsData) : [];
  const pages: any[] = pagesData ? firstArray(pagesData) : [];

  return (
    <Shell
      title="Fallback Pages, Error Handling & URL Redirects"
      actions={
        <>
          <ActionBtn icon={Upload}>Import CSV</ActionBtn>
          <ActionBtn icon={Upload}>Export Audit</ActionBtn>
          <ActionBtn icon={Plus} primary>Add Redirect Rule</ActionBtn>
        </>
      }
    >
      {/* Quick metrics */}
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <MetricCard label="Active Edge Rules" value={redirects.length || "1,248"} sub="38 regex patterns" icon={ArrowRight} />
        <MetricCard label="Redirect Rate (24h)" value="142.4k" sub="Avg latency: 3.2ms" icon={Activity} />
        <MetricCard label="404 Trapped Hits" value="892" sub="0.03% total requests" icon={AlertTriangle} tone="warn" />
        <MetricCard label="Failover Protection" value="Active" sub="S3 Stale Cache Hook" icon={Shield} tone="ok" />
      </div>

      {/* Redirect matrix */}
      <div style={{ padding: "0 24px 24px" }}>
        <Panel
          title="Edge URL Redirect Matrix"
          subtitle={`${redirects.length} redirects configured`}
          icon={ArrowRight}
          right={
            <>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Search size={12} style={{ position: "absolute", left: 8, color: T.muted }} />
                <input placeholder="Filter paths…" style={{ ...inputStyle, paddingLeft: 24, width: 160 }} />
              </div>
              <select style={inputStyle}>
                <option>All Types (301, 302, 307)</option>
                <option>301 Permanent</option>
                <option>302 Temporary</option>
              </select>
            </>
          }
          noPad
        >
          {redirectsLoading && <LoadingRow />}
          {redirects.length === 0 && !redirectsLoading ? (
            <EmptyState msg="No redirects configured. Add a rule to start routing." />
          ) : (
            <DataTable
              headers={["Source Path", "Target Route", "HTTP Code", "Status", "Actions"]}
              items={redirects.slice(0, 10)}
              renderRow={(r: any) => (
                <>
                  <Td><span style={{ fontFamily: "monospace", color: T.ink }}>^{r.from_url}</span></Td>
                  <Td><span style={{ fontFamily: "monospace", color: T.body }}>{r.to_url}</span></Td>
                  <Td><Chip tone="ok" mono>{r.status_code} PERM</Chip></Td>
                  <Td><Chip tone="ok">ACTIVE</Chip></Td>
                  <Td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button style={iconBtn}><Edit3 size={12} /></button>
                      <button style={{ ...iconBtn, color: T.bad }}><Trash2 size={12} /></button>
                    </div>
                  </Td>
                </>
              )}
            />
          )}
        </Panel>
      </div>

      {/* Fallback templates */}
      <div style={{ padding: "0 24px 24px" }}>
        <Panel
          title="Storefront Fallback Templates & Edge Resilience"
          subtitle="Decoupled error templates served when upstream rendering fails"
          icon={Shield}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {FALLBACK_TEMPLATES.map((f) => (
              <div
                key={f.id}
                style={{
                  border: `1px solid ${T.line}`,
                  borderRadius: 10,
                  background: "var(--card)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    background: T.faint,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: `1px solid ${T.line}`,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{f.name}</span>
                  <Chip tone={f.code === "404" || f.code === "410" ? "info" : "warn"} mono>{f.code}</Chip>
                </div>
                <div style={{ padding: 14 }}>
                  <p style={{ fontSize: 12, color: T.body, margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, fontFamily: "monospace", color: T.muted }}>
                    <span>{f.path}</span>
                    <button style={{ background: "transparent", border: 0, color: T.primary, cursor: "pointer", fontWeight: 700 }}>Edit Template →</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Regex validator + maintenance preview */}
      <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel
          title="Regex Edge Pattern Validator"
          subtitle="Test redirect patterns against live route table"
          icon={Code2}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={fieldLabel}>Pattern</label>
              <input defaultValue="^/legacy-sale/(.*)" style={inputStyle} />
            </div>
            <div>
              <label style={fieldLabel}>Replacement</label>
              <input defaultValue="/collections/archive/$1" style={inputStyle} />
            </div>
            <div>
              <label style={fieldLabel}>Test URL</label>
              <input defaultValue="/legacy-sale/aw23-lookbook" style={inputStyle} />
            </div>
            <ActionBtn icon={Zap} primary>Validate Pattern</ActionBtn>
            <div style={{ padding: 10, background: T.primaryTint, borderRadius: 6, fontSize: 11, fontFamily: "monospace", color: T.ink }}>
              ✓ Resolves to /collections/archive/aw23-lookbook
            </div>
          </div>
        </Panel>

        <Panel
          title="Maintenance Mode Preview"
          subtitle="Global fallback served when maintenance_mode = true"
          icon={Eye}
        >
          <div
            style={{
              background: "var(--foreground)",
              color: "var(--primary-foreground)",
              borderRadius: 10,
              padding: 24,
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".18em" }}>SUNNY STOREFRONT</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "6px 0 0" }}>Autumn Winter Architecture Lookbook</h3>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>
              We're refining the collection. Back shortly with the FW25 architectural capsule.
            </p>
            <button
              style={{
                marginTop: 4,
                alignSelf: "center",
                padding: "6px 14px",
                background: T.primary,
                color: "var(--primary-foreground)",
                border: "none",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              View Status Page
            </button>
          </div>
          {pagesLoading && <LoadingRow />}
          <div style={{ marginTop: 10, fontSize: 11, color: T.muted }}>
            {pages.length} pages currently registered on the storefront graph.
          </div>
        </Panel>
      </div>
    </Shell>
  );
}

// ============================================================================
// 16. GLOBAL COPY & LOCALE TRANSLATION SYNC
//    view=locale-sync
// ============================================================================
const LOCALE_MATRIX = [
  { code: "en-US", name: "English (United States)", coverage: 100, missing: 0, prs: "—", lastSync: "2026-02-18 14:12:08", state: "In Sync", canonical: true },
  { code: "fr-FR", name: "French (France)", coverage: 98.4, missing: 66, prs: "#1402 (1)", lastSync: "12 min ago", state: "Pending PR" },
  { code: "de-DE", name: "German (Germany)", coverage: 96.1, missing: 161, prs: "#1405 (2)", lastSync: "38 min ago", state: "Pending PR" },
  { code: "ja-JP", name: "Japanese (Japan)", coverage: 91.2, missing: 412, prs: "#1408 (1)", lastSync: "1h ago", state: "Pending PR" },
  { code: "es-ES", name: "Spanish (Spain)", coverage: 88.4, missing: 542, prs: "—", lastSync: "4h ago", state: "Needs Attention" },
  { code: "it-IT", name: "Italian (Italy)", coverage: 84.1, missing: 778, prs: "—", lastSync: "yesterday", state: "Needs Attention" },
  { code: "zh-CN", name: "Simplified Chinese", coverage: 76.5, missing: 1014, prs: "—", lastSync: "2d ago", state: "Needs Attention" },
  { code: "ko-KR", name: "Korean (South Korea)", coverage: 71.2, missing: 1242, prs: "—", lastSync: "3d ago", state: "Needs Attention" },
];

export function LocaleSyncView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/copy");
  const copy: any[] = data ? firstArray(data) : [];

  return (
    <Shell
      title="Global Copy & Locale Translation Sync"
      actions={
        <>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.primary }} />
            <span style={{ fontSize: 11, color: T.body }}>WEBHOOK DISPATCH: ACTIVE</span>
          </div>
        </>
      }
    >
      {/* Metric ribbon */}
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <MetricCard label="Synced Locales" value="8 / 8" sub="configured" icon={Globe} />
        <MetricCard label="Overall Coverage" value="88.9%" sub="+1.4% wk" icon={Activity} />
        <MetricCard label="Missing Keys" value="1,073" sub="across 7 tier-2" icon={Hash} tone="warn" />
        <MetricCard label="Open Crowdin PRs" value="14" sub="10 ready to merge" icon={GitBranch} tone="info" />
      </div>

      {/* Action panel */}
      <div
        style={{
          padding: "12px 24px",
          background: T.faint,
          borderBottom: `1px solid ${T.line}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionBtn icon={RefreshCw}>Trigger Crowdin Sync</ActionBtn>
          <ActionBtn icon={Upload}>Export XLIFF / JSON</ActionBtn>
          <ActionBtn icon={GitBranch}>Review 14 Pending PRs</ActionBtn>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: T.body }}>Filter:</span>
          <select style={inputStyle}>
            <option>All Locales (8)</option>
            <option>Needs Attention (&lt;90%)</option>
            <option>With Pending PRs</option>
          </select>
        </div>
      </div>

      {/* Translation matrix */}
      <div style={{ padding: 24 }}>
        <Panel
          title="Translation Synchronization Matrix"
          subtitle="Storefront Bundle v2.14.0-edge · Updated 14 seconds ago via webhook worker #04"
          icon={Globe}
          noPad
        >
          {loading && <LoadingRow />}
          <DataTable
            headers={["Locale / Regional Target", "Coverage", "Missing Keys", "Pending PRs", "Last Sync", "State", "Actions"]}
            items={LOCALE_MATRIX}
            renderRow={(l) => (
              <>
                <Td>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: T.ink }}>{l.code}</span>
                    <span style={{ fontSize: 11, color: T.body }}>{l.name}</span>
                    {l.canonical && <Chip tone="ok">SOURCE CANONICAL</Chip>}
                  </div>
                </Td>
                <Td>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: l.coverage >= 90 ? T.primary : T.warn }}>{l.coverage.toFixed(1)}%</span>
                    <div style={{ width: 60 }}>
                      <Progress value={l.coverage} tone={l.coverage >= 90 ? "ok" : "warn"} />
                    </div>
                  </div>
                </Td>
                <Td><span style={{ fontFamily: "monospace", fontSize: 11, color: l.missing > 0 ? T.body : T.muted }}>{l.missing} keys</span></Td>
                <Td><span style={{ fontFamily: "monospace", fontSize: 11, color: typeof l.prs === "string" && l.prs.startsWith("#") ? T.ink : T.muted }}>{l.prs}</span></Td>
                <Td><span style={{ fontSize: 11, color: T.body }}>{l.lastSync}</span></Td>
                <Td>
                  <Chip tone={l.state === "In Sync" ? "ok" : l.state === "Pending PR" ? "info" : "warn"}>
                    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                      {l.state}
                    </span>
                  </Chip>
                </Td>
                <Td align="right">
                  <ActionBtn>{l.state === "Pending PR" ? "Sync PR" : "Inspect"}</ActionBtn>
                </Td>
              </>
            )}
          />
        </Panel>

        {/* Lower split: density + webhook telemetry */}
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Panel title="Locale Density & Fallback Allocation" subtitle="Per-region routing depth" icon={Globe}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {LOCALE_MATRIX.map((l) => (
                <div key={l.code} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "8px 10px", background: T.faint, borderRadius: 6 }}>
                  <span style={{ fontFamily: "monospace", color: T.ink, fontWeight: 700 }}>{l.code}</span>
                  <span style={{ color: T.body }}>→ en-US fallback</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Webhook Engine Telemetry" subtitle="Crowdin → CMS dispatch stream" icon={Network}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { evt: "string.committed", target: "fr-FR bundle", status: "200", time: "12s ago" },
                { evt: "pr.opened", target: "#1405 de-DE", status: "201", time: "38m ago" },
                { evt: "translation.reviewed", target: "ja-JP bundle", status: "200", time: "1h ago" },
                { evt: "bundle.exported", target: "XLIFF master", status: "200", time: "4h ago" },
              ].map((w) => (
                <div key={w.evt + w.target} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: T.faint, borderRadius: 6, fontSize: 11 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", color: T.ink, fontWeight: 700 }}>{w.evt}</div>
                    <div style={{ color: T.muted }}>{w.target}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Chip tone="ok" mono>{w.status}</Chip>
                    <div style={{ color: T.muted, marginTop: 4 }}>{w.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* PR validation + payload preview */}
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Panel title="Automated PR Validation" subtitle="CI gate runs Zod + ReactIntl extractors" icon={Check}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                ["JSON syntax check", "PASS"],
                ["Key completeness vs en-US", "PASS"],
                ["Pluralization rules", "PASS"],
                ["ICU MessageFormat lint", "WARN"],
                ["RTL bidi markers (ar-SA)", "SKIP"],
              ].map(([label, status]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: T.faint, borderRadius: 6, fontSize: 11 }}>
                  <span style={{ color: T.ink }}>{label}</span>
                  <Chip tone={status === "PASS" ? "ok" : status === "WARN" ? "warn" : "idle"}>{status}</Chip>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Payload Log Preview" subtitle="Last 5 copy mutations" icon={FileText}>
            {copy.length === 0 && !loading ? (
              <EmptyState msg="No copy strings in current locale." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {copy.slice(0, 6).map((c: any) => (
                  <div key={c.id} style={{ padding: "8px 10px", background: T.faint, borderRadius: 6, fontSize: 11 }}>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, color: T.ink }}>{c.copy_key}</div>
                    <div style={{ color: T.body, marginTop: 2 }}>{c.copy_value?.slice(0, 80)}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

// ============================================================================
// 17. MEDIA LIBRARY TAXONOMY & CDN STORAGE
//    view=media-taxonomy
// ============================================================================
const FOLDERS = [
  { name: "Campaigns", count: "842", expanded: true, subfolders: [{ name: "Spring 2025", count: "312", active: true }, { name: "Holiday Archive", count: "530" }] },
  { name: "Products", count: "8.9k", expanded: true, subfolders: [{ name: "Lookbooks 2025", count: "1.2k" }, { name: "SKU Master Shots", count: "7.7k" }] },
  { name: "UI Icons & Vectors", count: "410" },
  { name: "Brand Assets", count: "188" },
];

const TAXONOMY_ASSETS = [
  { file: "sp25_hero_campaign_banner_01.raw", mime: "TIFF · 48.2 MB", dim: "3840 × 2160", pipeline: "AVIF / WebP Ready", compression: "-68%", uploader: "Studio Editor" },
  { file: "fw25_jacket_editorial_hi_res.tiff", mime: "TIFF · 52.1 MB", dim: "4096 × 5120", pipeline: "AVIF / WebP Ready", compression: "-72%", uploader: "Studio Editor" },
  { file: "pdp_overshirt_sku_4471.webp", mime: "WebP · 218 KB", dim: "1800 × 2400", pipeline: "Optimized Variant", compression: "—", uploader: "Auto Ingest" },
  { file: "plp_grid_tile_default.webp", mime: "WebP · 48 KB", dim: "600 × 800", pipeline: "Optimized Variant", compression: "—", uploader: "Auto Ingest" },
];

export function MediaTaxonomyView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/media");
  const assets: any[] = data ? firstArray(data) : [];
  const [selectedFolder, setSelectedFolder] = useState("Spring 2025");
  const [selectedAsset, setSelectedAsset] = useState(TAXONOMY_ASSETS[0].file);

  return (
    <Shell
      title="Media Library Taxonomy & CDN Storage"
      actions={
        <>
          <ActionBtn icon={Upload}>Upload High-Res Assets</ActionBtn>
          <ActionBtn icon={Plus}>Create Directory</ActionBtn>
          <ActionBtn icon={Sparkles}>Batch Optimize & WebP Convert</ActionBtn>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 0 }}>
        {/* LEFT — folder tree + asset table */}
        <div style={{ padding: 24, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 10,
              background: T.faint,
              borderRadius: 8,
            }}
          >
            <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: T.body }}>
              <RefreshCw size={12} /> Indexed: 14,892 items
            </span>
            <Chip mono>US-EAST-1 (R2 ACTIVE)</Chip>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", gap: 12, minHeight: 480 }}>
            {/* Folder tree */}
            <div style={{ background: T.faint, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>Asset Hierarchy</span>
                <Filter size={12} style={{ color: T.muted }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {FOLDERS.map((f) => (
                  <div key={f.name}>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        padding: "6px 8px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        color: T.ink,
                        fontWeight: 500,
                      }}
                      onClick={() => setSelectedFolder(f.name)}
                    >
                      {f.expanded ? <ChevronDown size={12} style={{ color: T.muted }} /> : <ChevronRight size={12} style={{ color: T.muted }} />}
                      {f.expanded ? <FolderOpen size={14} style={{ color: T.ink }} /> : <Folder size={14} style={{ color: T.muted }} />}
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>{f.count}</span>
                    </div>
                    {f.expanded && f.subfolders && (
                      <div style={{ paddingLeft: 18, marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                        {f.subfolders.map((s) => (
                          <div
                            key={s.name}
                            onClick={() => setSelectedFolder(s.name)}
                            style={{
                              display: "flex",
                              gap: 6,
                              alignItems: "center",
                              padding: "5px 8px",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 11,
                              background: selectedFolder === s.name ? T.primaryTint : "transparent",
                              color: selectedFolder === s.name ? T.primary : T.body,
                              fontWeight: selectedFolder === s.name ? 700 : 500,
                            }}
                          >
                            <Folder size={12} style={{ color: selectedFolder === s.name ? T.primary : T.muted }} />
                            <span style={{ flex: 1 }}>{s.name}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>{s.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: T.body }}>Folder Tier: Prod</span>
                  <span style={{ fontFamily: "monospace", color: T.ink }}>28.4% Cap</span>
                </div>
                <Progress value={28.4} tone="ok" />
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: 10, color: T.muted, marginTop: 4 }}>
                  <span>/campaigns/sp25</span>
                  <span>Tier 1 SSD</span>
                </div>
              </div>
            </div>

            {/* Asset table */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: T.muted }}>Campaigns</span>
                  <ChevronRight size={12} style={{ color: T.muted }} />
                  <span style={{ fontWeight: 700, color: T.ink }}>{selectedFolder}</span>
                  <Chip>312 Files</Chip>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Search size={12} style={{ position: "absolute", left: 6, color: T.muted }} />
                    <input placeholder="Filter files…" style={{ ...inputStyle, paddingLeft: 22, width: 140 }} />
                  </div>
                </div>
              </div>

              <div style={{ border: `1px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
                <DataTable
                  headers={["File Asset", "Dimensions", "CDN Pipeline", "Compression", "Actions"]}
                  items={TAXONOMY_ASSETS}
                  renderRow={(a) => (
                    <>
                      <Td>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 4,
                              background: T.faint,
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                            }}
                          >
                            <ImageIcon size={14} style={{ color: T.muted }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: T.ink }}>{a.file}</div>
                            <div style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>{a.mime}</div>
                          </div>
                        </div>
                      </Td>
                      <Td><span style={{ fontFamily: "monospace", fontSize: 11, color: T.body }}>{a.dim}</span></Td>
                      <Td><Chip tone="ok">{a.pipeline}</Chip></Td>
                      <Td>
                        <div style={{ fontFamily: "monospace", fontWeight: 700, color: T.ink }}>{a.compression}</div>
                        <div style={{ fontSize: 10, color: T.muted }}>Cloudflare Polish</div>
                      </Td>
                      <Td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={iconBtn} onClick={() => setSelectedAsset(a.file)}><Eye size={12} /></button>
                          <button style={iconBtn}><Edit3 size={12} /></button>
                        </div>
                      </Td>
                    </>
                  )}
                />
              </div>

              {/* Bound media library assets */}
              {assets.length > 0 && (
                <div style={{ marginTop: 6, padding: 10, background: T.faint, borderRadius: 6, fontSize: 11, color: T.body }}>
                  {assets.length} additional CMS-managed assets available · last ingest:{" "}
                  {assets[0]?.updated_at ? new Date(assets[0].updated_at).toLocaleString() : "—"}
                </div>
              )}
              {loading && <LoadingRow />}
            </div>
          </div>
        </div>

        {/* RIGHT — storage quota + asset inspector */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel
            title="Storage & Bandwidth Quota"
            subtitle="Cloudflare R2 + global egress"
            icon={Database}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: T.ink, letterSpacing: "-.02em" }}>1.42</span>
              <span style={{ fontSize: 16, color: T.muted }}>TB</span>
              <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>of 5 TB provisioned</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <Progress value={28.4} tone="ok" />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, fontFamily: "monospace", color: T.muted }}>
              <span>28.4% utilized</span>
              <span>Tier 1 SSD</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
              <div style={{ background: T.faint, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", color: T.muted, letterSpacing: ".1em" }}>Monthly Egress</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>24.8M</div>
                <div style={{ fontSize: 10, color: T.muted }}>requests served</div>
              </div>
              <div style={{ background: T.faint, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", color: T.muted, letterSpacing: ".1em" }}>Cache Hit Ratio</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.primary }}>99.4%</div>
                <div style={{ fontSize: 10, color: T.muted }}>regional edge nodes</div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Asset Inspector"
            subtitle={selectedAsset}
            icon={Eye}
          >
            <div
              style={{
                aspectRatio: "4 / 3",
                background: T.faint,
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                marginBottom: 10,
              }}
            >
              <ImageIcon size={48} style={{ color: T.muted }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.muted }}>Filename</span>
                <span style={{ fontFamily: "monospace", color: T.ink }}>{selectedAsset}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.muted }}>Source MIME</span>
                <span style={{ fontFamily: "monospace", color: T.ink }}>image/tiff</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.muted }}>Dimensions</span>
                <span style={{ fontFamily: "monospace", color: T.ink }}>3840 × 2160</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.muted }}>CDN URL</span>
                <span style={{ fontFamily: "monospace", color: T.primary }}>cdn.sunnyapparel.com/sp25/01.avif</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.muted }}>Uploader</span>
                <span style={{ color: T.ink }}>Studio Editor</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <ActionBtn icon={Copy}>Copy URL</ActionBtn>
              <ActionBtn icon={Edit3}>Edit Metadata</ActionBtn>
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

// ============================================================================
// 18. MENUS, NAVIGATION HEADER & MEGA MENU BUILDER
//    view=mega-menu-builder
// ============================================================================
const MENU_TREE = [
  {
    label: "Men",
    slug: "/category/men",
    type: "MEGA-MENU",
    sublinks: [
      { label: "Outerwear", href: "/category/men/outerwear", col: 1, tag: "POPULAR" },
      { label: "Knitwear", href: "/category/men/knitwear", col: 1, tag: "NEW" },
      { label: "Tailoring", href: "/category/men/tailoring", col: 2 },
      { label: "Shoes", href: "/category/men/shoes", col: 2 },
    ],
    slot: "assets/campaign-fw25-m.webp",
  },
  {
    label: "Women",
    slug: "/category/women",
    type: "MEGA-MENU",
    sublinks: [
      { label: "Coats", href: "/category/women/coats", col: 1 },
      { label: "Dresses", href: "/category/women/dresses", col: 1, tag: "FEATURED" },
      { label: "Essentials", href: "/category/women/essentials", col: 2 },
    ],
  },
  {
    label: "Editions",
    slug: "/editorial/editions-2025",
    type: "DIRECT LINK",
  },
  {
    label: "Archive",
    slug: "/collections/historical-archive",
    type: "DIRECT LINK",
  },
];

export function MegaMenuBuilderView() {
  const { data, loading } = useFetch<any>("/api/admin/cms/navigation?location=header&withItems=true");
  const menus: any[] = data ? firstArray(data) : [];
  const [active, setActive] = useState("Men");

  return (
    <Shell
      title="Menus, Navigation Header & Mega Menu Builder"
      actions={
        <>
          <ActionBtn icon={Plus}>Add Root Menu</ActionBtn>
          <ActionBtn icon={Code2} primary>Compile Navigation JSON</ActionBtn>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 0 }}>
        {/* LEFT — tree editor */}
        <div style={{ padding: 24, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel
            title="Storefront Tree Structure"
            subtitle="Strict Taxonomy · Drag to rearrange nest depth, URLs, metadata tags, and slot cards."
            icon={ListTree}
            right={
              <>
                <ActionBtn icon={Plus}>Add Root</ActionBtn>
                <ActionBtn icon={ChevronRight}>Add Sub-Link</ActionBtn>
              </>
            }
          >
            <div
              style={{
                background: T.faint,
                borderRadius: 8,
                padding: "8px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Filter size={12} style={{ color: T.muted }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: T.ink, textTransform: "uppercase", letterSpacing: ".1em" }}>Depth Filter:</span>
                <Chip mono>L1 & L2 Visible</Chip>
              </div>
              <span style={{ fontSize: 11, color: T.muted }}>Nodes: 24 active</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MENU_TREE.map((node) => (
                <div
                  key={node.label}
                  style={{
                    border: `1px solid ${T.line}`,
                    borderRadius: 10,
                    background: "var(--card)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    onClick={() => setActive(node.label)}
                    style={{
                      padding: "10px 14px",
                      background: active === node.label ? T.primaryTint : T.faint,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                      <Menu size={14} style={{ color: T.muted, cursor: "grab" }} />
                      {node.sublinks ? <FolderOpen size={16} style={{ color: T.ink }} /> : <LinkIcon size={16} style={{ color: T.ink }} />}
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{node.label}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: T.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.slug}</span>
                      <Chip tone={node.type === "MEGA-MENU" ? "ok" : "idle"}>{node.type}</Chip>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button style={iconBtn}><Plus size={12} /></button>
                      <button style={iconBtn}><Settings size={12} /></button>
                    </div>
                  </div>
                  {node.sublinks && (
                    <div style={{ padding: "8px 14px 8px 32px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {node.sublinks.map((s) => (
                        <div
                          key={s.label}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 10px",
                            background: T.faint,
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ color: T.ink, fontWeight: 600 }}>{s.label}</span>
                            {s.tag && <Chip tone="info">{s.tag}</Chip>}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontFamily: "monospace", fontSize: 10, color: T.muted }}>{s.href}</span>
                            <span style={{ fontSize: 10, color: T.muted }}>Col {s.col}</span>
                          </div>
                        </div>
                      ))}
                      {node.slot && (
                        <div style={{ padding: "6px 10px", background: T.primaryTint, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
                            <ImageIcon size={14} style={{ color: T.primary }} />
                            <span style={{ color: T.ink, fontWeight: 600 }}>Lookbook Card Slot:</span>
                            <span style={{ fontFamily: "monospace", color: T.body }}>{node.slot}</span>
                          </div>
                          <Chip tone="ok">Bound Col 4</Chip>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          {/* Active node inspector */}
          <Panel
            title="Active Node Inspector"
            subtitle={`${active} · ID: item_${Math.random().toString(36).slice(2, 8)}`}
            icon={Settings}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={fieldLabel}>Display Label</label>
                <input defaultValue={active} style={inputStyle} />
              </div>
              <div>
                <label style={fieldLabel}>Target Route URI</label>
                <input defaultValue={`/category/${active.toLowerCase()}`} style={inputStyle} />
              </div>
              <div>
                <label style={fieldLabel}>Item Type</label>
                <select style={inputStyle}>
                  <option>Mega Menu</option>
                  <option>Direct Link</option>
                  <option>Dropdown</option>
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Sort Order</label>
                <input type="number" defaultValue={1} style={inputStyle} />
              </div>
            </div>
          </Panel>

          {loading && <LoadingRow />}
          {menus.length > 0 && (
            <div style={{ padding: 10, background: T.faint, borderRadius: 6, fontSize: 11, color: T.body }}>
              Bound header menu: <strong style={{ color: T.ink }}>{menus[0]?.name}</strong> · {menus[0]?.items?.length || 0} items
            </div>
          )}
        </div>

        {/* RIGHT — live mega-menu simulator */}
        <div style={{ padding: 24 }}>
          <Panel
            title="Storefront Canvas Simulator"
            subtitle="Hover the Men tab to preview the mega-menu popover"
            icon={Eye}
          >
            <div
              style={{
                background: "var(--card)",
                border: `1px solid ${T.line}`,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {/* Header strip */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: `1px solid ${T.line}`,
                }}
              >
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: ".12em", color: T.ink }}>SUNNY</span>
                  <div style={{ display: "flex", gap: 14 }}>
                    {MENU_TREE.map((n) => (
                      <button
                        key={n.label}
                        onMouseEnter={() => setActive(n.label)}
                        onClick={() => setActive(n.label)}
                        style={{
                          fontSize: 12,
                          fontWeight: active === n.label ? 700 : 500,
                          color: active === n.label ? T.primary : T.body,
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {n.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, color: T.muted }}>
                  <Search size={14} />
                  <Package size={14} />
                  <Settings size={14} />
                </div>
              </div>

              {/* Mega menu popover */}
              {(() => {
                const activeNode = MENU_TREE.find((n) => n.label === active);
                if (!activeNode || !activeNode.sublinks) {
                  return (
                    <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: T.muted }}>
                      Hover a mega-menu root to preview the popover panel.
                    </div>
                  );
                }
                return (
                  <div
                    style={{
                      padding: 16,
                      background: T.faint,
                      borderBottom: `1px solid ${T.line}`,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted, marginBottom: 6 }}>Column 1</div>
                      {activeNode.sublinks.filter((s) => s.col === 1).map((s) => (
                        <div key={s.label} style={{ fontSize: 12, color: T.ink, padding: "4px 0" }}>
                          {s.label} {s.tag && <Chip tone="info">{s.tag}</Chip>}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted, marginBottom: 6 }}>Column 2</div>
                      {activeNode.sublinks.filter((s) => s.col === 2).map((s) => (
                        <div key={s.label} style={{ fontSize: 12, color: T.ink, padding: "4px 0" }}>
                          {s.label}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted, marginBottom: 6 }}>Lookbook Slot</div>
                      <div
                        style={{
                          background: "var(--card)",
                          borderRadius: 8,
                          aspectRatio: "4 / 5",
                          display: "grid",
                          placeItems: "center",
                          border: `1px solid ${T.line}`,
                        }}
                      >
                        <div style={{ textAlign: "center" }}>
                          <ImageIcon size={24} style={{ color: T.muted }} />
                          <div style={{ fontSize: 11, color: T.ink, marginTop: 4, fontWeight: 700 }}>The Winter Solstice Capsule</div>
                          <div style={{ fontSize: 10, color: T.muted }}>Editorial Lookbook</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Hero preview */}
              <div
                style={{
                  padding: 24,
                  background: "var(--foreground)",
                  color: "var(--primary-foreground)",
                  minHeight: 80,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".18em", color: T.primary }}>SUNNY</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>The Winter Solstice Capsule</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>Architectural pieces for high-movement daily life.</div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

// ============================================================================
// 19. STOREFRONT CONTENT EXPERIENCE STUDIO + LIVE PREVIEW
//    view=storefront-preview
// ============================================================================
const HERO_DEFAULTS = {
  headline: "Precision Crafted Activewear for High Performance",
  subtitle: "Engineered with breathable recycled fabrics. Designed by you, manufactured sustainably to order.",
  primaryLabel: "Explore Drop",
  primaryHref: "/collections/new-arrivals",
  secondaryLabel: "Custom 3D Studio",
};

const GLOBAL_BLOCKS = [
  { id: "#block-g1", title: "Lifetime Guarantee", body: "Every piece covered by our unconditional 100-day fit & tear guarantee." },
  { id: "#block-g2", title: "Shipping Promise", body: "Carbon neutral express logistics on all domestic deliveries over $75." },
  { id: "#block-g3", title: "Circular Lifecycle", body: "Trade in your pre-loved Sunny pieces for $25 storefront credit anytime." },
];

export function StorefrontPreviewView() {
  const { data: blocksData } = useFetch<any>("/api/admin/cms/blocks?status=published");
  const { data: navData } = useFetch<any>("/api/admin/cms/navigation?location=header&withItems=true");
  const { data: offersData } = useFetch<any>("/api/admin/cms/offers");
  const blocks: any[] = blocksData ? firstArray(blocksData) : [];
  const navMenus: any[] = navData ? firstArray(navData) : [];
  const offers: any[] = offersData ? firstArray(offersData) : [];

  const [bannerText, setBannerText] = useState("Free shipping over $75 | Use code SHIPFREE at checkout");
  const [hero, setHero] = useState(HERO_DEFAULTS);

  const navItems = navMenus[0]?.items?.slice(0, 4) || [
    { label: "Shop", href: "/shop" },
    { label: "Collections", href: "/collections" },
    { label: "Custom 3D Studio", href: "/studio" },
    { label: "Lookbook", href: "/lookbook" },
  ];

  return (
    <Shell
      title="Storefront Content Experience Studio"
      actions={
        <>
          <ActionBtn icon={Calendar}>Schedule Release</ActionBtn>
          <ActionBtn icon={Save} primary>Save All Changes</ActionBtn>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 0 }}>
        {/* LEFT — Form panels */}
        <div style={{ padding: 24, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Banners */}
          <Panel
            title="Banners, Announcement Bars & Pop-ups"
            subtitle="Banners live on specified page surfaces. Promo notification strips render atop the desktop viewport."
            icon={Sparkles}
            right={<Chip tone="ok">Live on Production</Chip>}
          >
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 10 }}>
              <div>
                <label style={fieldLabel}>Banner Headline & Microcopy</label>
                <input
                  value={bannerText}
                  onChange={(e) => setBannerText(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabel}>Action URL</label>
                <input defaultValue="/collections/all-products" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
              <label style={{ display: "flex", gap: 6, fontSize: 11, color: T.body, alignItems: "center" }}>
                <input type="checkbox" defaultChecked /> Countdown Timer
              </label>
              <label style={{ display: "flex", gap: 6, fontSize: 11, color: T.body, alignItems: "center" }}>
                <input type="checkbox" defaultChecked /> Dismissible
              </label>
            </div>
            {/* Preview strip */}
            <div
              style={{
                background: "var(--foreground)",
                color: "var(--primary-foreground)",
                borderRadius: 8,
                padding: "8px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Chip tone="ok" mono>PREVIEW</Chip>
                <span>{bannerText}</span>
              </div>
              <span style={{ color: "var(--muted-foreground)", textDecoration: "underline", cursor: "pointer" }}>Shop New Arrivals →</span>
            </div>
          </Panel>

          {/* Navigation */}
          <Panel
            title="Storefront Navigation & Menus"
            subtitle="Drag to reorder menus, manage nested mega-menu dropdowns and routing pathways."
            icon={ListTree}
            right={
              <>
                <span style={{ fontSize: 11, color: T.muted }}>Locale: <strong style={{ color: T.body }}>en-US (Default)</strong></span>
                <ActionBtn icon={Plus}>Add Menu Item</ActionBtn>
              </>
            }
          >
            <div style={{ border: `1px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
              {navItems.map((item: any, i: number) => (
                <div
                  key={item.id || i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: i % 2 === 0 ? "var(--card)" : T.faint,
                    borderBottom: i < navItems.length - 1 ? `1px solid ${T.faint}` : "none",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Menu size={14} style={{ color: T.muted, cursor: "grab" }} />
                    <span style={{ width: 20, height: 20, borderRadius: 4, background: T.faint, display: "grid", placeItems: "center", fontSize: 10, color: T.body, fontFamily: "monospace" }}>{i + 1}</span>
                    <span style={{ fontWeight: 700, color: T.ink }}>{item.label}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, background: T.faint, padding: "1px 6px", borderRadius: 4, color: T.body }}>{item.href}</span>
                    <Chip>MegaMenu</Chip>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button style={iconBtn}><Edit3 size={12} /></button>
                    <button style={iconBtn}><Copy size={12} /></button>
                    <button style={{ ...iconBtn, color: T.bad }}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Offers messaging */}
          <Panel
            title="Discounts & Offers Messaging Engine"
            subtitle="Promo code callouts rendered on PDP and cart surfaces"
            icon={Tag}
          >
            {offers.length === 0 ? (
              <EmptyState msg="No offers bound — create one in the Offers view." />
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {offers.slice(0, 6).map((o: any) => (
                  <span
                    key={o.id}
                    style={{
                      padding: "6px 10px",
                      background: "var(--foreground)",
                      color: "var(--primary-foreground)",
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}
                  >
                    {o.code} · {o.offer_type}
                  </span>
                ))}
              </div>
            )}
          </Panel>

          {/* Hero blocks */}
          <Panel
            title="Home Hero & Storefront Content Blocks"
            subtitle="Live hero copy, dynamic CTA triggers, and global guarantee reusable blocks."
            icon={Layout}
            right={<Chip mono>block_hero_v3</Chip>}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={fieldLabel}>Home Hero Headline</label>
                <input
                  value={hero.headline}
                  onChange={(e) => setHero({ ...hero, headline: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabel}>Home Hero Subtitle</label>
                <input
                  value={hero.subtitle}
                  onChange={(e) => setHero({ ...hero, subtitle: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={fieldLabel}>Primary CTA Label</label>
                <input
                  value={hero.primaryLabel}
                  onChange={(e) => setHero({ ...hero, primaryLabel: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabel}>Primary CTA Target</label>
                <input
                  value={hero.primaryHref}
                  onChange={(e) => setHero({ ...hero, primaryHref: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabel}>Secondary CTA Label</label>
                <input
                  value={hero.secondaryLabel}
                  onChange={(e) => setHero({ ...hero, secondaryLabel: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabel}>Hero Asset Mode</label>
                <select style={inputStyle}>
                  <option>Editorial Subtle Monochrome</option>
                  <option>High-Res Lookbook Video</option>
                  <option>Split Dual Imagery</option>
                </select>
              </div>
            </div>

            <label style={fieldLabel}>Global Content Blocks (Reusable across PDP & checkout)</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {GLOBAL_BLOCKS.map((b) => (
                <div key={b.id} style={{ padding: 12, background: T.faint, borderRadius: 8, border: `1px solid ${T.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
                    <span>{b.title}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: T.muted }}>{b.id}</span>
                  </div>
                  <textarea defaultValue={b.body} style={{ width: "100%", background: "var(--card)", border: `1px solid ${T.line}`, borderRadius: 4, padding: 6, fontSize: 11, color: T.body, resize: "none", height: 48 }} />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: T.muted }}>
              {blocks.length} published content blocks available across the storefront.
            </div>
          </Panel>
        </div>

        {/* RIGHT — live storefront preview */}
        <div style={{ padding: 24, background: T.faint }}>
          <Panel
            title="Interactive Live Storefront Preview"
            subtitle="1440 × 900 Desktop · sunnyapparel.com"
            icon={Eye}
            right={<Chip mono>Live</Chip>}
          >
            <div
              style={{
                background: "var(--card)",
                borderRadius: 10,
                border: `1px solid ${T.line}`,
                overflow: "hidden",
              }}
            >
              {/* Browser chrome */}
              <div
                style={{
                  padding: "6px 10px",
                  background: T.faint,
                  borderBottom: `1px solid ${T.line}`,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.idle }} />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.idle }} />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.idle }} />
                </div>
                <div
                  style={{
                    flex: 1,
                    background: "var(--card)",
                    border: `1px solid ${T.line}`,
                    borderRadius: 4,
                    padding: "3px 8px",
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: T.body,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ color: T.muted }}>🔒</span>
                  https://sunnyapparel.com/?preview_token=pld_9831
                </div>
              </div>

              {/* Banner strip */}
              <div
                style={{
                  background: "var(--foreground)",
                  color: "var(--primary-foreground)",
                  fontSize: 11,
                  padding: "6px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ display: "flex", gap: 6, alignItems: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <Tag size={11} style={{ color: "var(--muted-foreground)" }} />
                  {bannerText}
                </span>
                <span style={{ color: "var(--muted-foreground)", textDecoration: "underline", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>Shop Now</span>
              </div>

              {/* Nav */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderBottom: `1px solid ${T.line}`,
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: T.ink, display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ width: 8, height: 8, background: T.ink, borderRadius: 2 }} /> SUNNY APPAREL
                  </span>
                  <div style={{ display: "flex", gap: 10, fontSize: 11, fontWeight: 500 }}>
                    {navItems.slice(0, 4).map((item: any, i: number) => (
                      <span key={item.id || i} style={{ color: i === 0 ? T.ink : T.body, fontWeight: i === 0 ? 600 : 400, cursor: "pointer" }}>
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, color: T.muted }}>
                  <Search size={12} />
                  <Package size={12} />
                </div>
              </div>

              {/* Hero */}
              <div
                style={{
                  background: "linear-gradient(135deg, var(--foreground) 0%, color-mix(in srgb, var(--foreground) 88%, var(--primary)) 50%, color-mix(in srgb, var(--foreground) 94%, black) 100%)",
                  color: "var(--primary-foreground)",
                  padding: 24,
                  position: "relative",
                  minHeight: 160,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                    opacity: 0.3,
                  }}
                />
                <div style={{ position: "relative", maxWidth: 280 }}>
                  <Chip tone="ok">New Season Arrival</Chip>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: "8px 0 4px", letterSpacing: "-.01em" }}>{hero.headline}</h3>
                  <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.4 }}>{hero.subtitle}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button style={{ padding: "5px 12px", background: "var(--card)", color: T.ink, border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {hero.primaryLabel}
                    </button>
                    <button style={{ padding: "5px 12px", background: "transparent", color: "var(--primary-foreground)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                      {hero.secondaryLabel}
                    </button>
                  </div>
                </div>
              </div>

              {/* Offer badge */}
              <div
                style={{
                  padding: "8px 14px",
                  background: T.faint,
                  borderBottom: `1px solid ${T.line}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 11,
                }}
              >
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ background: "var(--card)", padding: "1px 6px", borderRadius: 3, fontFamily: "monospace", fontWeight: 700, color: T.ink, fontSize: 10 }}>WELCOME10</span>
                  <span style={{ color: T.body }}>10% off applied for your first order</span>
                </div>
                <span style={{ fontSize: 10, color: T.muted, cursor: "pointer" }}>Details →</span>
              </div>

              {/* Product grid */}
              <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "var(--card)" }}>
                {[
                  { name: "Strata Aero Jacket", price: "$128.00", badge: "ECO-KNIT", featured: true },
                  { name: "Veloce Runner Pro", price: "$165.00", badge: "POPULAR" },
                ].map((p) => (
                  <div key={p.name} style={{ padding: 10, border: `1px solid ${T.line}`, borderRadius: 8, background: "var(--card)" }}>
                    <div
                      style={{
                        height: 70,
                        background: T.faint,
                        borderRadius: 6,
                        marginBottom: 8,
                        position: "relative",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Package size={24} style={{ color: T.muted }} />
                      <span
                        style={{
                          position: "absolute",
                          top: 6,
                          left: 6,
                          background: p.featured ? T.ink : T.chip,
                          color: p.featured ? "var(--card)" : T.body,
                          fontSize: 8,
                          fontWeight: 700,
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        {p.badge}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: T.subtle }}>{p.price}</div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ padding: "10px 14px", background: T.faint, borderTop: `1px solid ${T.line}`, textAlign: "center" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 10, color: T.body, marginBottom: 6 }}>
                  <div>100-Day Fit Guarantee</div>
                  <div>Free Carbon Neutral Post</div>
                  <div>Circular Recycled Fabric</div>
                </div>
                <div style={{ fontSize: 9, color: T.muted, borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
                  © 2026 Sunny Apparel Worldwide Inc. All rights reserved.
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

// ============================================================================
// REGISTRY EXPORT — for the CmsDashboard router
// ============================================================================
export const CMS_MISSING_VIEWS: Record<string, () => JSX.Element> = {
  audience: AudienceTargetingView,
  banners: BannersView,
  "web-vitals": WebVitalsView,
  "edge-optimization": EdgeOptimizationView,
  funnel: FunnelView,
  integrations: IntegrationsView,
  "mobile-drawer": MobileDrawerView,
  locales: LocalesView,
  "storefront-engine": StorefrontEngineView,
  "prop-validators": PropValidatorsView,
  "block-schemas": BlockSchemasView,
  "slot-catalog": SlotCatalogView,
  "footer-builder": FooterBuilderView,
  "volume-tiers": VolumeTiersView,
  "fallback-pages": FallbackPagesView,
  "locale-sync": LocaleSyncView,
  "media-taxonomy": MediaTaxonomyView,
  "mega-menu-builder": MegaMenuBuilderView,
  "storefront-preview": StorefrontPreviewView,
};
