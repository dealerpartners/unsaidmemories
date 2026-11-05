import { createServerClient } from "@/lib/supabase";
import { taxonomy, findNodePathByName, type TaxonomyNode } from "@/lib/taxonomy";
import { helpArticles, ourWorldArticles, relationships } from "@/lib/catalog";

/**
 * Website CMS (W4) — the shared model for banners, pop-ups, placements
 * and the Payload-owned content this site reads.
 *
 * Ownership, stated plainly so the two CMSs are never confused:
 * - Payload CMS (the separate unsaid-cms project) owns pages, posts,
 *   header, footer, redirects, forms and media in the `payload` schema
 *   of this Supabase project — and, per the coordinator's Payload-wins
 *   rule, banners and pop-ups too: `payload.banners` /
 *   `payload.popups` (migration 20261031010000, which moved them out
 *   of the short-lived public tables from 20261030233000). This repo
 *   READS those tables (server-side, service role) and writes banners,
 *   pop-ups, redirects, nav items and media rows through the API
 *   routes below. Page and form editing stays in the Payload admin,
 *   which owns their block and version tables; the banners/popups
 *   collection definitions in the unsaid-cms project are still owed
 *   by whoever owns that project, so the Payload admin UI does not
 *   yet list them — this repo's Website admin pages are the editor
 *   until then.
 * - Placement is a page path. The placement list is generated, not
 *   typed: every static page, every shop category path from the
 *   taxonomy (all 278 nodes), every collection from the database and
 *   every relationship page that actually resolves — so a banner or
 *   pop-up can target any generated page, category pages included.
 * - One published banner and one published pop-up per placement,
 *   enforced by partial unique indexes. Publish is a swap: the old
 *   published row for that placement is unpublished first, so a page
 *   never shows two banners (never boxed, never stacked). The
 *   storefront renders a per-page banner INSTEAD of the global strip,
 *   never as well as it.
 */

export interface BannerRow {
  id: number;
  placement: string;
  placement_label: string;
  title: string;
  body: string;
  cta_label: string;
  cta_href: string;
  bg_color: string;
  text_color: string;
  image_url: string;
  image_source: "upload" | "pollinations" | "media";
  image_prompt: string;
  status: "draft" | "published";
  starts_at: string | null;
  ends_at: string | null;
  dismissible: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PopupRow extends BannerRow {
  trigger_type: "delay" | "exit_intent" | "scroll" | "immediate";
  trigger_value: number;
  frequency: "once_per_session" | "once_per_day" | "every_visit";
  form_id: number | null;
  show_on_mobile: boolean;
}

export type PlacementGroup = { group: string; items: { path: string; label: string }[] };

const HEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

export function isValidPlacement(p: unknown): p is string {
  return (
    typeof p === "string" &&
    p.length >= 1 &&
    p.length <= 200 &&
    p.startsWith("/") &&
    !p.includes(" ") &&
    !p.includes("..") &&
    !p.includes("?") &&
    !p.includes("#")
  );
}

export function isValidHex(c: unknown): boolean {
  return typeof c === "string" && HEX.test(c);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function optDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseCommon(body: Record<string, unknown>): { errors: string[]; data: Record<string, unknown> } {
  const errors: string[] = [];
  if (!isValidPlacement(body.placement)) errors.push("placement must be a page path like /shop/accessories");
  if (body.bg_color !== undefined && !isValidHex(body.bg_color)) errors.push("bg_color must be a hex color like #23212b");
  if (body.text_color !== undefined && !isValidHex(body.text_color)) errors.push("text_color must be a hex color");
  if (body.image_source !== undefined && !["upload", "pollinations", "media"].includes(String(body.image_source))) {
    errors.push("image_source must be upload, pollinations or media");
  }
  if (body.status !== undefined && !["draft", "published"].includes(String(body.status))) {
    errors.push("status must be draft or published");
  }
  const starts_at = optDate(body.starts_at);
  const ends_at = optDate(body.ends_at);
  if (body.starts_at && !starts_at) errors.push("starts_at must be a date");
  if (body.ends_at && !ends_at) errors.push("ends_at must be a date");
  if (starts_at && ends_at && starts_at > ends_at) errors.push("starts_at must be before ends_at");
  return {
    errors,
    data: {
      placement: body.placement,
      placement_label: str(body.placement_label),
      title: str(body.title),
      body: str(body.body),
      cta_label: str(body.cta_label),
      cta_href: str(body.cta_href),
      bg_color: body.bg_color ?? "#23212b",
      text_color: body.text_color ?? "#ffffff",
      image_url: str(body.image_url),
      image_source: body.image_source ?? "upload",
      image_prompt: str(body.image_prompt),
      status: body.status ?? "draft",
      starts_at,
      ends_at,
      dismissible: body.dismissible !== false,
      updated_at: new Date().toISOString(),
    },
  };
}

export function parseBanner(body: unknown): { errors: string[]; data: Record<string, unknown> | null } {
  if (!body || typeof body !== "object") return { errors: ["body must be JSON"], data: null };
  const { errors, data } = parseCommon(body as Record<string, unknown>);
  return { errors, data: errors.length ? null : data };
}

export function parsePopup(body: unknown): { errors: string[]; data: Record<string, unknown> | null } {
  if (!body || typeof body !== "object") return { errors: ["body must be JSON"], data: null };
  const b = body as Record<string, unknown>;
  const { errors, data } = parseCommon(b);
  if (b.trigger_type !== undefined && !["delay", "exit_intent", "scroll", "immediate"].includes(String(b.trigger_type))) {
    errors.push("trigger_type must be delay, exit_intent, scroll or immediate");
  }
  if (b.frequency !== undefined && !["once_per_session", "once_per_day", "every_visit"].includes(String(b.frequency))) {
    errors.push("frequency must be once_per_session, once_per_day or every_visit");
  }
  const trigger_value = b.trigger_value === undefined ? 5 : Number(b.trigger_value);
  if (!Number.isInteger(trigger_value) || trigger_value < 0 || trigger_value > 100) {
    errors.push("trigger_value must be a whole number 0–100 (seconds, or scroll percent)");
  }
  let form_id: number | null = null;
  if (b.form_id !== undefined && b.form_id !== null && b.form_id !== "") {
    form_id = Number(b.form_id);
    if (!Number.isInteger(form_id) || form_id <= 0) errors.push("form_id must be a Payload form id");
  }
  if (errors.length) return { errors, data: null };
  return {
    errors,
    data: {
      ...data,
      trigger_type: b.trigger_type ?? "delay",
      trigger_value,
      frequency: b.frequency ?? "once_per_session",
      form_id,
      show_on_mobile: b.show_on_mobile !== false,
    },
  };
}

/** A row is live for shoppers: published and inside its window. */
export function isLive(row: { status: string; starts_at: string | null; ends_at: string | null }, now = new Date()): boolean {
  if (row.status !== "published") return false;
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.ends_at && new Date(row.ends_at) < now) return false;
  return true;
}

/** Publish swap: unpublish every other published row for the placement. */
export async function unpublishOthers(
  table: "banners" | "popups",
  placement: string,
  exceptId?: number,
): Promise<void> {
  const pool = getPayloadPool();
  if (exceptId !== undefined) {
    await pool.query(
      `UPDATE payload.${table} SET status = 'draft', updated_at = now() WHERE placement = $1 AND status = 'published' AND id <> $2`,
      [placement, exceptId],
    );
  } else {
    await pool.query(
      `UPDATE payload.${table} SET status = 'draft', updated_at = now() WHERE placement = $1 AND status = 'published'`,
      [placement],
    );
  }
}

/**
 * Payload access runs on raw pg, NOT on PostgREST (supabase-js).
 * PostgREST in this project exposes only the public schema — a
 * payload-schema query through it fails with "Invalid schema:
 * payload" (proven live 2026-10-31). Payload's own app uses direct
 * Postgres, and this repo's lib/pg.ts exists for exactly this
 * cross-schema case. The pool below mirrors lib/pg's shape (max 5,
 * transaction pooler) and accepts the same connection envs the rest
 * of the app uses, so it works wherever UNSAID_DATABASE_URL,
 * DATABASE_URL, or the Supabase pooler/direct URIs are set.
 */
import { Pool } from "pg";
import { toTransactionPooler, normalizePoolerHost } from "@/lib/pg";

let payloadPool: Pool | null = null;

export function getPayloadPool(): Pool {
  if (!payloadPool) {
    const raw =
      process.env.UNSAID_DATABASE_URL ||
      process.env.DATABASE_URL ||
      process.env.SUPABASE_SESSION_POOLER ||
      process.env.SUPABASE_DIRECT_CONNECTION ||
      "";
    const cs = toTransactionPooler(normalizePoolerHost(raw));
    if (!cs) throw new Error("No database connection string configured (UNSAID_DATABASE_URL / DATABASE_URL / SUPABASE_SESSION_POOLER)");
    payloadPool = new Pool({ connectionString: cs, max: 5, idleTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } });
  }
  return payloadPool;
}

const BANNER_COLS = [
  "placement", "placement_label", "title", "body", "cta_label", "cta_href",
  "bg_color", "text_color", "image_url", "image_source", "image_prompt",
  "status", "starts_at", "ends_at", "dismissible", "updated_at",
];
const POPUP_COLS = [
  ...BANNER_COLS,
  "trigger_type", "trigger_value", "frequency", "form_id", "show_on_mobile",
];

async function insertRow(table: string, cols: string[], data: Record<string, unknown>, createdBy: string | null): Promise<Record<string, unknown>> {
  const all = [...cols, "created_by"];
  const vals = [...cols.map((c) => data[c] ?? null), createdBy];
  const ph = vals.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await getPayloadPool().query(
    `INSERT INTO payload.${table} (${all.join(", ")}) VALUES (${ph}) RETURNING *`,
    vals,
  );
  return rows[0];
}

async function updateRow(table: string, cols: string[], id: number, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const vals = cols.map((c) => data[c] ?? null);
  const { rows } = await getPayloadPool().query(
    `UPDATE payload.${table} SET ${sets} WHERE id = $${cols.length + 1} RETURNING *`,
    [...vals, id],
  );
  return rows[0] ?? null;
}

export const insertBanner = (d: Record<string, unknown>, by: string | null) => insertRow("banners", BANNER_COLS, d, by);
export const insertPopup = (d: Record<string, unknown>, by: string | null) => insertRow("popups", POPUP_COLS, d, by);
export const updateBanner = (id: number, d: Record<string, unknown>) => updateRow("banners", BANNER_COLS, id, d);
export const updatePopup = (id: number, d: Record<string, unknown>) => updateRow("popups", POPUP_COLS, id, d);

export async function listBanners(placement?: string | null, status?: string | null): Promise<Record<string, unknown>[]> {
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (placement) { vals.push(placement); conds.push(`placement = $${vals.length}`); }
  if (status) { vals.push(status); conds.push(`status = $${vals.length}`); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await getPayloadPool().query(`SELECT * FROM payload.banners ${where} ORDER BY updated_at DESC LIMIT 500`, vals);
  return rows;
}

export async function listPopups(placement?: string | null, status?: string | null): Promise<Record<string, unknown>[]> {
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (placement) { vals.push(placement); conds.push(`placement = $${vals.length}`); }
  if (status) { vals.push(status); conds.push(`status = $${vals.length}`); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await getPayloadPool().query(`SELECT * FROM payload.popups ${where} ORDER BY updated_at DESC LIMIT 500`, vals);
  return rows;
}

export async function getBanner(id: number): Promise<Record<string, unknown> | null> {
  const { rows } = await getPayloadPool().query(`SELECT * FROM payload.banners WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getPopup(id: number): Promise<Record<string, unknown> | null> {
  const { rows } = await getPayloadPool().query(`SELECT * FROM payload.popups WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getLiveBanner(placement: string): Promise<Record<string, unknown> | null> {
  const { rows } = await getPayloadPool().query(
    `SELECT * FROM payload.banners WHERE placement = $1 AND status = 'published' LIMIT 1`,
    [placement],
  );
  return rows[0] ?? null;
}

export async function getLivePopup(placement: string): Promise<Record<string, unknown> | null> {
  const { rows } = await getPayloadPool().query(
    `SELECT * FROM payload.popups WHERE placement = $1 AND status = 'published' LIMIT 1`,
    [placement],
  );
  return rows[0] ?? null;
}

function taxonomyPaths(): { path: string; label: string }[] {
  const out: { path: string; label: string }[] = [];
  const walk = (node: TaxonomyNode, prefix: string, trail: string) => {
    const path = prefix ? `${prefix}/${node.slug}` : node.slug;
    out.push({ path: `/shop/${path}`, label: `${trail} ${node.name}`.trim() });
    for (const child of node.children) walk(child, path, `${trail} ${node.name} ›`);
  };
  for (const dept of taxonomy) walk(dept, "", "");
  return out;
}

/** Every generated page, grouped — the placement picker source. */
export async function listPlacements(): Promise<PlacementGroup[]> {
  const staticPages: { path: string; label: string }[] = [
    { path: "/", label: "Home" },
    { path: "/shop", label: "Shop all products" },
    { path: "/departments", label: "Departments" },
    { path: "/signature", label: "UnSaid signature" },
    { path: "/cart", label: "Your bag" },
    { path: "/account", label: "Your account" },
    { path: "/how-it-works", label: "How it works" },
    { path: "/gift-finder", label: "Gift finder" },
    { path: "/guides-stories", label: "Guides & stories" },
    { path: "/kinnectai", label: "KinnectAI" },
    { path: "/our-story", label: "Our story" },
    { path: "/corporate-gifting", label: "Corporate gifting" },
    { path: "/funeral-homes", label: "Funeral homes" },
    { path: "/senior-living", label: "Senior living" },
    { path: "/schools-hospitals", label: "Schools & hospitals" },
    { path: "/wedding-planners", label: "Wedding planners" },
    { path: "/shipping-returns", label: "Shipping & returns" },
    { path: "/size-guide", label: "Size guide" },
    { path: "/track-order", label: "Track your order" },
    { path: "/contact", label: "Contact us" },
    { path: "/help", label: "Help & care" },
    { path: "/sitemap", label: "Sitemap" },
    ...helpArticles.map((a) => ({ path: `/help/${a.slug}`, label: `Help — ${a.title}` })),
    { path: "/relationships", label: "Relationships" },
    ...ourWorldArticles.map((a) => ({ path: `/our-world/${a.slug}`, label: `Our world — ${a.eyebrow}` })),
  ];

  // Relationship pages that actually resolve (taxonomy children only —
  // "Ride or Die" is deliberately absent: no such category exists).
  const chain = findNodePathByName("Relationships");
  const relSlugs = new Set((chain?.[chain.length - 1]?.children ?? []).map((c) => c.slug));
  const relationshipPages = relationships
    .filter((r) => relSlugs.has(r.slug))
    .map((r) => ({ path: `/relationships/${r.slug}`, label: `Relationship — ${r.name}` }));

  let collections: { path: string; label: string }[] = [];
  try {
    const db = createServerClient();
    const { data } = await db.from("collections").select("name, slug").order("name").limit(200);
    collections = (data ?? []).filter((c) => c.slug).map((c) => ({ path: `/collections/${c.slug}`, label: `Collection — ${c.name}` }));
  } catch {
    collections = [];
  }

  return [
    { group: "Pages", items: staticPages },
    { group: "Shop categories", items: taxonomyPaths() },
    { group: "Collections", items: collections },
    { group: "Relationships", items: relationshipPages },
  ];
}
