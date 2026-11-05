"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, FileText, Image, Layout, Navigation, Palette, Tag, Calendar, GitBranch, Shield, Globe, Percent, ShoppingCart, BarChart3, Settings } from "lucide-react";
import { ContentBlocksEditor } from "./cms-blocks-editor";
import { NavigationView, MediaLibraryView, WebsiteSettingsView, OffersView, DesignTokensView, GlobalCopyView, RedirectsView, AuditLogView, CampaignsView, PagesView } from "./cms-sections";
import { NavigationEditor, DesignTokenEditor, GlobalCopyEditor } from "./cms-editors";
import {
  AudienceTargetingView, BannersView, WebVitalsView, EdgeOptimizationView,
  FunnelView, IntegrationsView, MobileDrawerView, LocalesView,
  StorefrontEngineView, PropValidatorsView, BlockSchemasView, SlotCatalogView,
  FooterBuilderView, VolumeTiersView, FallbackPagesView, LocaleSyncView,
  MediaTaxonomyView, MegaMenuBuilderView, StorefrontPreviewView,
} from "./cms-missing-sections";

type BlockSummary = {
  id: string; block_id: string; component_type: string; status: string;
  props: Record<string, any>; updated_at: string;
};

const CMS_SECTIONS = [
  { label: "Content Blocks", desc: "Create and manage reusable content components", href: "/admin/website/cms/blocks", icon: Layout, color: "var(--primary)" },
  { label: "Content Blocks JSON Schema", desc: "Schema definitions, node types, field validation", href: "/admin/website/cms/block-schemas", icon: FileText, color: "var(--primary)" },
  { label: "Content Blocks Slot Catalog", desc: "Slot definitions, placement rules, allowed components", href: "/admin/website/cms/slot-catalog", icon: Layout, color: "var(--primary)" },
  { label: "Component Prop Validators", desc: "Storefront contracts, Zod schemas, prop validation", href: "/admin/website/cms/prop-validators", icon: Shield, color: "var(--primary)" },
  { label: "Pages & Routes", desc: "Page definitions, SEO config, layout templates", href: "/admin/website/cms/pages", icon: FileText, color: "var(--primary)" },
  { label: "Storefront Engine & Canonical SEO", desc: "Rendering engine, canonical URLs, JSON-LD, robots.txt", href: "/admin/website/cms/storefront-engine", icon: Globe, color: "var(--primary)" },
  { label: "Storefront Preview", desc: "Live storefront preview with CMS content", href: "/admin/website/cms/storefront-preview", icon: Layout, color: "var(--primary)" },
  { label: "Storefront Menus & Navigation", desc: "Header menus, mega menu builder, mobile drawer", href: "/admin/website/cms/nav", icon: Navigation, color: "var(--primary)" },
  { label: "Mega Menu Builder", desc: "Header mega menu columns, slots, featured content", href: "/admin/website/cms/mega-menu-builder", icon: Navigation, color: "var(--primary)" },
  { label: "Footer Columns & Utility Nav", desc: "Footer column builder, utility navigation links", href: "/admin/website/cms/footer-builder", icon: Navigation, color: "var(--primary)" },
  { label: "Mobile App Drawer & Slide-out", desc: "Mobile navigation drawer, slide-out menu config", href: "/admin/website/cms/mobile-drawer", icon: Navigation, color: "var(--primary)" },
  { label: "Media Library & CDN Optimizer", desc: "Images, CDN optimization, responsive profiles", href: "/admin/website/cms/media", icon: Image, color: "var(--primary)" },
  { label: "Media Taxonomy & CDN Storage", desc: "Media categories, tags, CDN storage profiles", href: "/admin/website/cms/media-taxonomy", icon: Tag, color: "var(--primary)" },
  { label: "Edge Image Optimization", desc: "Responsive CDN profiles, format conversion, lazy load", href: "/admin/website/cms/edge-optimization", icon: Image, color: "var(--primary)" },
  { label: "Global Copy & Design Tokens", desc: "Colors, typography, spacing, translatable copy", href: "/admin/website/cms/tokens", icon: Palette, color: "var(--primary)" },
  { label: "Global Copy Editor", desc: "Translatable strings, context, status management", href: "/admin/website/cms/copy", icon: Globe, color: "var(--primary)" },
  { label: "Locale Translation Sync", desc: "Translation confidence, worker status, sync engine", href: "/admin/website/cms/locale-sync", icon: Globe, color: "var(--primary)" },
  { label: "Regional Locales & Currency", desc: "Locale matrix, currency exchange, Geo-IP simulation", href: "/admin/website/cms/locales", icon: Globe, color: "var(--primary)" },
  { label: "Discount Offers", desc: "Promo codes, offer types, usage limits, scheduling", href: "/admin/website/cms/offers", icon: Percent, color: "var(--primary)" },
  { label: "Volume Tier Matrix & Bundle Rules", desc: "Quantity-based pricing, bundle discounts, tier calculator", href: "/admin/website/cms/volume-tiers", icon: Percent, color: "var(--primary)" },
  { label: "Cart Threshold & Progress Engine", desc: "Free shipping bars, tiered progress, reward engine", href: "/admin/website/cms/thresholds", icon: ShoppingCart, color: "var(--primary)" },
  { label: "Banners & Announcement Bars", desc: "Banner management, announcement bars, modal config", href: "/admin/website/cms/banners", icon: Layout, color: "var(--primary)" },
  { label: "Campaign Scheduling", desc: "Campaign calendar, deployment timeline, scheduling", href: "/admin/website/cms/campaigns", icon: Calendar, color: "var(--primary)" },
  { label: "Audience Targeting & Segments", desc: "Segmentation rules, trigger logic, audience builder", href: "/admin/website/cms/audience", icon: Tag, color: "var(--primary)" },
  { label: "Funnel Conversion & Telemetry", desc: "Browse-to-confirmation sequence, drop-off analytics", href: "/admin/website/cms/funnel", icon: BarChart3, color: "var(--primary)" },
  { label: "Storefront Analytics & Heatmap", desc: "Component heatmap, impressions, clicks, conversion", href: "/admin/website/cms/analytics", icon: BarChart3, color: "var(--primary)" },
  { label: "Core Web Vitals & Performance", desc: "LCP, CLS, INP benchmarks, payload budget, diagnostics", href: "/admin/website/cms/web-vitals", icon: BarChart3, color: "var(--primary)" },
  { label: "Version Revisions & Rollback", desc: "Revision history, rollback studio, environment diff", href: "/admin/website/cms/versions", icon: GitBranch, color: "var(--primary)" },
  { label: "Audit History & Security", desc: "Security stream, change history, action log", href: "/admin/website/cms/audit", icon: Shield, color: "var(--primary)" },
  { label: "Fallback Pages & Error Handling", desc: "404/500 config, error page templates, redirect rules", href: "/admin/website/cms/fallback-pages", icon: Shield, color: "var(--primary)" },
  { label: "URL Redirects", desc: "301/302/307/308 redirects, active management", href: "/admin/website/cms/redirects", icon: ArrowRight, color: "var(--primary)" },
  { label: "Integrations & API Keys", desc: "Webhook gateways, API key management, provider config", href: "/admin/website/cms/integrations", icon: Settings, color: "var(--primary)" },
];

export function CmsDashboard() {
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/cms/blocks?status=published")
      .then(r => r.json())
      .then(data => setBlocks(data.blocks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const published = blocks.length;
  const recentBlocks = blocks.slice(0, 5);

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      {/* Header */}
      <div style={{ padding: "28px 32px", borderBottom: "1px solid var(--border)" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "var(--foreground)", letterSpacing: "-.03em" }}>
          Content Management System
        </h1>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, borderBottom: "1px solid var(--border)" }}>
        {[
          { label: "Published Blocks", value: published, sub: "live on storefront" },
          { label: "CMS Sections", value: CMS_SECTIONS.length, sub: "pages in the CMS sidebar" },
          { label: "Block Types", value: new Set(blocks.map((b) => b.component_type)).size, sub: "in use on published blocks" },
          { label: "Last Published", value: blocks.length ? new Date(Math.max(...blocks.map((b) => new Date(b.updated_at).getTime()))).toLocaleDateString() : "—", sub: "most recent block update" },
        ].map((stat, i) => (
          <div key={i} style={{ padding: "20px 24px", borderRight: i < 3 ? "1px solid var(--border)" : "none" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--primary)", letterSpacing: "-.03em" }}>{stat.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", marginTop: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Recent blocks */}
      <div style={{ padding: "0 32px 28px" }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "var(--foreground)" }}>
          Recently Published Blocks
        </h2>
        {loading ? (
          <div style={{ color: "var(--muted-foreground)", fontSize: 12, padding: "16px 0" }}>Loading…</div>
        ) : recentBlocks.length === 0 ? (
          <div style={{
            padding: "24px", border: "1px dashed var(--border)", borderRadius: 12,
            textAlign: "center", color: "var(--muted-foreground)", fontSize: 12,
          }}>
            No published blocks yet. Create your first content block to see it here.
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {recentBlocks.map((block, i) => (
              <div
                key={block.id}
                style={{
                  display: "flex", alignItems: "center", gap: 16, padding: "14px 20px",
                  borderBottom: i < recentBlocks.length - 1 ? "1px solid var(--muted)" : "none",
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                    {block.component_type}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                    {block.block_id} · updated {new Date(block.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: ".08em" }}>
                  {block.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
