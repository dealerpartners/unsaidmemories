import type { Metadata } from "next";
import { DevelopersClient } from "./developers-client";

export const metadata: Metadata = {
  title: "Developer portal — UnSaid licensee ads",
  description:
    "Build on the UnSaid licensee ad API: advertiser accounts, API keys, campaigns, creatives, placements, rate cards, serving, and reporting — plus the Kinnect store feed.",
};

const ENDPOINTS: Array<[string, string, string]> = [
  ["POST /api/v1/licensee/accounts", "Create an advertiser account + first key (no key needed)", "display_name, contact_email"],
  ["GET /api/v1/licensee/accounts", "Your account (key)", "—"],
  ["GET/POST/DELETE /api/v1/licensee/keys", "List, mint, revoke API keys (key)", "name"],
  ["GET/POST /api/v1/licensee/campaigns", "List / build a campaign (key)", "name, placement_code, cpm_cents or rate_card_item_id, tier_code, flight, budgets"],
  ["GET/PATCH /api/v1/licensee/campaigns/[id]", "Read / publish, pause, end a campaign (key)", "status, starts_at, ends_at, budgets"],
  ["GET/POST /api/v1/licensee/creatives", "List / design an ad creative (key)", "campaign_id, headline, body, cta, image_url, click_url, product_id"],
  ["PATCH /api/v1/licensee/creatives/[id]", "Edit a creative (key)", "headline, body, cta, image_url, click_url, status"],
  ["GET /api/v1/licensee/placements", "Active placements (key)", "—"],
  ["GET /api/v1/licensee/rate-card", "Rate cards + per-tier, per-placement CPM (key)", "—"],
  ["GET/POST /api/v1/licensee/serve", "Serve ads for a placement (public)", "placement, category_id, device, state, language"],
  ["GET /api/v1/licensee/report", "Counters + daily delivery for your campaigns (key)", "campaign_id?"],
  ["GET /api/v1/licensee/products", "Finished products to feature in an ad (key)", "q, limit, offset"],
  ["POST /api/webhooks/ad-events", "Count an impression / click / conversion", "type, campaign_id, creative_id, placement"],
  ["GET /api/store/v1/products", "Kinnect store feed: all finished products (licensee or store key)", "limit (max 200), offset"],
];

const MAPPING: Array<[string, string, string]> = [
  ["Advertiser account", "licensee_advertisers (+ ad_advertisers)", "One licensee account owns one active ad_advertisers row, which is what serving checks."],
  ["API key", "licensee_api_keys", "Only the SHA-256 hash is stored. Scopes: ads:read, ads:write, store:read."],
  ["Campaign", "ad_campaigns", "Draft until published; flight window + budgets enforced by serving."],
  ["Campaign placement + direct cost", "ad_campaign_placements + ad_campaign_rates", "The chosen placement and its snapshot CPM. No auction: price is chosen, not bid."],
  ["Creative design", "licensee_creative_designs → ad_creatives", "Designed in the Ad Center; the servable row lives in ad_creatives (Default group)."],
  ["Featured product", "supplier_catalog_products (is_hidden = false)", "Finished products only. Design lives in this studio, never on the licensee side."],
  ["Event log (OLAP)", "ad_events (monthly partitions)", "One row per counted event, written by the edge function or the webhook."],
  ["Counters (OLAP)", "ad_event_counters + ad_campaign_daily", "Atomic rollups via the increment_ad_event RPC — the only counter writer."],
  ["Placements", "ad_placements", "plp_in_grid, plp_below_grid, plp_right_rail, pdp_below_gallery, pdp_sidebar, shop_sidebar, home_hero_secondary, cart_cross_sell."],
  ["Tiers + rate card", "ad_tiers + ad_rate_cards + ad_rate_card_items", "Tier order (Platinum → Gold → Silver → House) decides fill; the rate card decides cost."],
];

export default function DevelopersPage() {
  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "40px 20px 80px",
        display: "grid",
        gap: 32,
      }}
    >
      <header>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}>
          Developer portal
        </h1>
        <p style={{ color: "#525252", fontSize: 16, maxWidth: 720 }}>
          The UnSaid licensee ad API: advertisers self-serve in Unsaid and
          are served through an API from this hosted stack. Authenticate
          with <code>Authorization: Bearer lk_…</code> (or the{" "}
          <code>x-licensee-api-key</code> header). The Ad Center at{" "}
          <a href="/ad-center">/ad-center</a> runs on this same API — there
          is no separate portal code path. Advertisers start at{" "}
          <a href="/advertise">/advertise</a>.
        </p>
      </header>

      <DevelopersClient />

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>How serving decides</h2>
        <p style={{ color: "#525252", fontSize: 15 }}>
          Deterministic, in this order: placement → tier order (Platinum,
          Gold, Silver, House) → flight window (starts_at ≤ now &lt;
          ends_at) → frequency cap → daily and lifetime budgets. No
          auction, no bids, no pacing. A campaign&apos;s price was
          snapshotted per placement at build time from the rate card you
          chose; money enters selection only as a budget cap.
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 24 }}>
          How counting works
        </h2>
        <p style={{ color: "#525252", fontSize: 15 }}>
          Shop-page slots fire a viewability beacon (half the slot
          visible, once per ad) to <code>/api/webhooks/ad-events</code>.
          Server-to-server writers use the Supabase Edge Function{" "}
          <code>ad-events</code> with the <code>x-ad-ingest-key</code>{" "}
          header. Both call the same <code>increment_ad_event</code> RPC,
          which appends the partitioned event log row and atomically
          bumps <code>ad_event_counters</code> and{" "}
          <code>ad_campaign_daily</code>.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Endpoints</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 14, width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e5e5" }}>
                <th style={{ padding: "8px 8px 8px 0" }}>Endpoint</th>
                <th style={{ padding: 8 }}>What it does</th>
                <th style={{ padding: 8 }}>Body / query</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map(([ep, what, body]) => (
                <tr key={ep} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 8px 8px 0", fontFamily: "monospace", whiteSpace: "nowrap" }}>{ep}</td>
                  <td style={{ padding: 8 }}>{what}</td>
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 13 }}>{body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>
          Table mapping for integrators
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 14, width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e5e5" }}>
                <th style={{ padding: "8px 8px 8px 0" }}>Concept</th>
                <th style={{ padding: 8 }}>Table(s)</th>
                <th style={{ padding: 8 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {MAPPING.map(([concept, table, note]) => (
                <tr key={concept} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 8px 8px 0", fontWeight: 600 }}>{concept}</td>
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 13 }}>{table}</td>
                  <td style={{ padding: 8 }}>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Kinnect store feed</h2>
        <p style={{ color: "#525252", fontSize: 15 }}>
          <code>GET /api/store/v1/products?limit=200&amp;offset=0</code>{" "}
          returns the full finished catalog (20,084 products) with{" "}
          <code>total</code>, <code>limit</code>, and <code>offset</code>{" "}
          for paging. Authenticate with a Developer-portal licensee key
          (scope <code>store:read</code>) or a legacy Store API key.
          Finished products only — Kinnect reads them into its in-app
          store; no design happens on the Kinnect side.
        </p>
      </section>
    </main>
  );
}
