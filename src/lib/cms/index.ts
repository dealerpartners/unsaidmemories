/**
 * CMS Data Access Layer — types + query helpers for the Unsaid CMS.
 *
 * All 25 entities from the 20261101000000_unsaid_cms_schema.sql migration.
 * Uses pgQuery (raw SQL via the Supabase session pooler) for consistency
 * with the rest of the admin API. Every function is tenant-scoped.
 */

import { pgQuery } from "@/lib/pg";
import { getTenantId } from "@/lib/tenant";

// ============================================================================
// TYPES
// ============================================================================

export type CmsContentBlock = {
  id: string; tenant_id: string; block_id: string; schema_id: string | null;
  component_type: string; props: Record<string, any>; slot_id: string | null;
  page_id: string | null; status: "draft" | "published" | "archived" | "scheduled";
  locale: string; sort_order: number; scheduled_at: string | null; expires_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
};

export type CmsPage = {
  id: string; tenant_id: string; route: string; title: string;
  page_type: "static" | "dynamic" | "collection" | "product" | "redirect";
  seo_config: Record<string, any>; layout_config: Record<string, any>;
  status: "draft" | "published" | "archived"; locale: string;
  parent_id: string | null; sort_order: number; created_by: string | null;
  created_at: string; updated_at: string;
};

export type CmsNavigationMenu = {
  id: string; tenant_id: string; name: string;
  location: "header" | "footer" | "mobile" | "sidebar" | "account";
  status: "active" | "inactive"; locale: string; created_at: string; updated_at: string;
};

export type CmsNavigationItem = {
  id: string; tenant_id: string; menu_id: string; parent_id: string | null;
  label: string; href: string;
  item_type: "direct_link" | "mega_menu" | "dropdown" | "button" | "divider" | "external";
  columns: number; slots: string[]; icon: string | null; badge: string | null;
  badge_color: string | null; target: string | null; sort_order: number;
  status: "active" | "hidden"; created_at: string; updated_at: string;
};

export type CmsMediaAsset = {
  id: string; tenant_id: string; media_id: string; url: string; cdn_url: string | null;
  mime_type: string; file_size: string | null; width: number | null; height: number | null;
  alt_text: string | null; title: string | null; caption: string | null;
  source: "upload" | "pollinations" | "url" | "api"; source_prompt: string | null;
  tags: string[]; category_id: string | null; metadata: Record<string, any>;
  status: "active" | "archived" | "processing" | "failed"; created_by: string | null;
  created_at: string; updated_at: string;
};

export type CmsWebsiteSettings = {
  id: string; tenant_id: string; brand_name: string; logo_url: string | null;
  logo_dark_url: string | null; favicon_url: string | null; canonical_origin: string;
  default_locale: string; default_currency: string; gtm_container: string | null;
  csp_mode: "enforce" | "report-only" | "off"; seo_defaults: Record<string, any>;
  social_links: Record<string, any>; cookie_config: Record<string, any>;
  maintenance_mode: boolean; maintenance_message: string | null;
  created_at: string; updated_at: string;
};

export type CmsDesignToken = {
  id: string; tenant_id: string;
  category: "color" | "typography" | "spacing" | "radius" | "shadow" | "border" | "motion";
  token_key: string; token_value: string; label: string | null;
  scope: "global" | "header" | "footer" | "hero" | "section"; locale: string;
  sort_order: number; status: string; created_at: string; updated_at: string;
};

export type CmsOffer = {
  id: string; tenant_id: string; code: string; name: string; description: string | null;
  offer_type: "percent" | "fixed" | "bogo" | "free_shipping" | "gift"; value: string;
  conditions: Record<string, any>; status: "draft" | "active" | "expired" | "paused";
  starts_at: string | null; ends_at: string | null; usage_limit: number | null;
  usage_count: number; per_customer_limit: number; stackable: boolean;
  created_by: string | null; created_at: string; updated_at: string;
};

export type CmsRedirect = {
  id: string; tenant_id: string; from_url: string; to_url: string;
  status_code: 301 | 302 | 307 | 308; active: boolean; created_by: string | null;
  created_at: string; updated_at: string;
};

export type CmsAuditEntry = {
  id: string; tenant_id: string; event_id: string; action: string; entity: string;
  entity_id: string | null; user_id: string | null; user_role: string | null;
  ip_address: string | null; mfa_method: string | null; details: Record<string, any>;
  created_at: string;
};

// ============================================================================
// DATA ACCESS (tenant-scoped)
// ============================================================================

const TENANT = () => { try { return getTenantId(); } catch { return ""; } };

// --- Content Blocks ---
export async function getContentBlocks(opts?: {
  pageId?: string; slotId?: string; status?: string; locale?: string;
}): Promise<CmsContentBlock[]> {
  const t = TENANT(); if (!t) return [];
  let sql = `SELECT * FROM public.cms_content_blocks WHERE tenant_id = $1`;
  const params: unknown[] = [t]; let i = 2;
  if (opts?.pageId) { sql += ` AND page_id = $${i++}`; params.push(opts.pageId); }
  if (opts?.slotId) { sql += ` AND slot_id = $${i++}`; params.push(opts.slotId); }
  if (opts?.status) { sql += ` AND status = $${i++}`; params.push(opts.status); }
  if (opts?.locale) { sql += ` AND locale = $${i++}`; params.push(opts.locale); }
  sql += ` ORDER BY sort_order, created_at`;
  return pgQuery<CmsContentBlock>(sql, params);
}

export async function createContentBlock(block: Partial<CmsContentBlock>): Promise<CmsContentBlock | null> {
  const t = TENANT(); if (!t) return null;
  const rows = await pgQuery<CmsContentBlock>(
    `INSERT INTO public.cms_content_blocks (tenant_id, block_id, schema_id, component_type, props, slot_id, page_id, status, locale, sort_order, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [t, block.block_id, block.schema_id, block.component_type, JSON.stringify(block.props ?? {}),
     block.slot_id, block.page_id, block.status ?? "draft", block.locale ?? "en-US",
     block.sort_order ?? 0, block.created_by]);
  return rows[0] ?? null;
}

export async function updateContentBlock(id: string, patch: Partial<CmsContentBlock>): Promise<CmsContentBlock | null> {
  const t = TENANT(); if (!t) return null;
  const sets: string[] = []; const params: unknown[] = [t, id]; let i = 3;
  if (patch.props !== undefined) { sets.push(`props = $${i++}`); params.push(JSON.stringify(patch.props)); }
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); params.push(patch.status); }
  if (patch.slot_id !== undefined) { sets.push(`slot_id = $${i++}`); params.push(patch.slot_id); }
  if (patch.sort_order !== undefined) { sets.push(`sort_order = $${i++}`); params.push(patch.sort_order); }
  if (sets.length === 0) return null;
  sets.push(`updated_at = now()`);
  const rows = await pgQuery<CmsContentBlock>(
    `UPDATE public.cms_content_blocks SET ${sets.join(", ")} WHERE tenant_id = $1 AND id = $2 RETURNING *`, params);
  return rows[0] ?? null;
}

export async function deleteContentBlock(id: string): Promise<boolean> {
  const t = TENANT(); if (!t) return false;
  await pgQuery(`DELETE FROM public.cms_content_blocks WHERE tenant_id = $1 AND id = $2`, [t, id]);
  return true;
}

// --- Pages ---
export async function getPages(): Promise<CmsPage[]> {
  const t = TENANT(); if (!t) return [];
  return pgQuery<CmsPage>(`SELECT * FROM public.cms_pages WHERE tenant_id = $1 ORDER BY sort_order, route`, [t]);
}

export async function getPageByRoute(route: string, locale = "en-US"): Promise<CmsPage | null> {
  const rows = await pgQuery<CmsPage>(
    `SELECT * FROM public.cms_pages WHERE tenant_id = $1 AND route = $2 AND locale = $3 AND status = 'published'`,
    [TENANT(), route, locale]);
  return rows[0] ?? null;
}

// --- Navigation ---
export async function getNavigationMenus(location?: string): Promise<CmsNavigationMenu[]> {
  const t = TENANT(); if (!t) return [];
  if (location) {
    return pgQuery<CmsNavigationMenu>(
      `SELECT * FROM public.cms_navigation_menus WHERE tenant_id = $1 AND location = $2 AND status = 'active' ORDER BY name`, [t, location]);
  }
  return pgQuery<CmsNavigationMenu>(`SELECT * FROM public.cms_navigation_menus WHERE tenant_id = $1 ORDER BY name`, [t]);
}

export async function getNavigationItems(menuId: string): Promise<CmsNavigationItem[]> {
  const t = TENANT(); if (!t) return [];
  return pgQuery<CmsNavigationItem>(
    `SELECT * FROM public.cms_navigation_items WHERE tenant_id = $1 AND menu_id = $2 AND status = 'active' ORDER BY sort_order`, [t, menuId]);
}

// --- Media ---
export async function getMediaAssets(opts?: { limit?: number }): Promise<CmsMediaAsset[]> {
  const t = TENANT(); if (!t) return [];
  let sql = `SELECT * FROM public.cms_media_assets WHERE tenant_id = $1 AND status = 'active' ORDER BY created_at DESC`;
  if (opts?.limit) sql += ` LIMIT ${opts.limit}`;
  return pgQuery<CmsMediaAsset>(sql, [t]);
}

export async function createMediaAsset(asset: Partial<CmsMediaAsset>): Promise<CmsMediaAsset | null> {
  const t = TENANT(); if (!t) return null;
  const mediaId = asset.media_id || `med_${Date.now().toString(36)}`;
  const rows = await pgQuery<CmsMediaAsset>(
    `INSERT INTO public.cms_media_assets (tenant_id, media_id, url, cdn_url, mime_type, file_size, width, height, alt_text, title, caption, source, source_prompt, tags, metadata, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active',$16) RETURNING *`,
    [t, mediaId, asset.url, asset.cdn_url, asset.mime_type, asset.file_size, asset.width, asset.height,
     asset.alt_text, asset.title, asset.caption, asset.source ?? "upload", asset.source_prompt,
     JSON.stringify(asset.tags ?? []), JSON.stringify(asset.metadata ?? {}), asset.created_by]);
  return rows[0] ?? null;
}

// --- Website Settings ---
export async function getWebsiteSettingsRow(): Promise<CmsWebsiteSettings | null> {
  const t = TENANT(); if (!t) return null;
  const rows = await pgQuery<CmsWebsiteSettings>(`SELECT * FROM public.cms_website_settings WHERE tenant_id = $1`, [t]);
  if (rows[0]) return rows[0];
  const created = await pgQuery<CmsWebsiteSettings>(
    `INSERT INTO public.cms_website_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING RETURNING *`, [t]);
  return created[0] ?? null;
}

// --- Offers ---
export async function getOffers(status?: string): Promise<CmsOffer[]> {
  const t = TENANT(); if (!t) return [];
  if (status) {
    return pgQuery<CmsOffer>(`SELECT * FROM public.cms_offers WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC`, [t, status]);
  }
  return pgQuery<CmsOffer>(`SELECT * FROM public.cms_offers WHERE tenant_id = $1 ORDER BY created_at DESC`, [t]);
}

// --- Redirects ---
export async function getRedirects(): Promise<CmsRedirect[]> {
  const t = TENANT(); if (!t) return [];
  return pgQuery<CmsRedirect>(`SELECT * FROM public.cms_redirects WHERE tenant_id = $1 AND active = true ORDER BY from_url`, [t]);
}

export async function getRedirectForUrl(fromUrl: string): Promise<CmsRedirect | null> {
  const rows = await pgQuery<CmsRedirect>(
    `SELECT * FROM public.cms_redirects WHERE tenant_id = $1 AND from_url = $2 AND active = true`, [TENANT(), fromUrl]);
  return rows[0] ?? null;
}

// --- Audit ---
export async function getAuditLog(limit = 50): Promise<CmsAuditEntry[]> {
  const t = TENANT(); if (!t) return [];
  return pgQuery<CmsAuditEntry>(`SELECT * FROM public.cms_audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`, [t, limit]);
}

export async function logAuditEvent(entry: {
  action: string; entity: string; entity_id?: string; user_id?: string;
  user_role?: string; ip_address?: string; details?: Record<string, any>;
}): Promise<void> {
  const t = TENANT(); if (!t) return;
  const eventId = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await pgQuery(
    `INSERT INTO public.cms_audit_log (tenant_id, event_id, action, entity, entity_id, user_id, user_role, ip_address, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [t, eventId, entry.action, entry.entity, entry.entity_id ?? null, entry.user_id ?? null,
     entry.user_role ?? null, entry.ip_address ?? null, JSON.stringify(entry.details ?? {})]);
}

// --- Design Tokens ---
export async function getDesignTokens(category?: string): Promise<CmsDesignToken[]> {
  const t = TENANT(); if (!t) return [];
  if (category) {
    return pgQuery<CmsDesignToken>(`SELECT * FROM public.cms_design_tokens WHERE tenant_id = $1 AND category = $2 AND status = 'active' ORDER BY sort_order`, [t, category]);
  }
  return pgQuery<CmsDesignToken>(`SELECT * FROM public.cms_design_tokens WHERE tenant_id = $1 AND status = 'active' ORDER BY category, sort_order`, [t]);
}

// --- Global Copy ---
export async function getGlobalCopy(locale = "en-US"): Promise<CmsGlobalCopy[]> {
  const t = TENANT(); if (!t) return [];
  return pgQuery<CmsGlobalCopy>(
    `SELECT * FROM public.cms_global_copy WHERE tenant_id = $1 AND locale = $2 AND status = 'active' ORDER BY copy_key`, [t, locale]);
}

// --- Campaigns ---
export async function getCampaigns(status?: string): Promise<CmsCampaign[]> {
  const t = TENANT(); if (!t) return [];
  if (status) {
    return pgQuery<CmsCampaign>(`SELECT * FROM public.cms_campaigns WHERE tenant_id = $1 AND status = $2 ORDER BY start_date DESC NULLS LAST`, [t, status]);
  }
  return pgQuery<CmsCampaign>(`SELECT * FROM public.cms_campaigns WHERE tenant_id = $1 ORDER BY start_date DESC NULLS LAST`, [t]);
}

// --- Global Copy type (if not already defined) ---
export type CmsGlobalCopy = {
  id: string; tenant_id: string; copy_key: string; copy_value: string;
  locale: string; context: string | null; status: "active" | "draft" | "needs_review";
  translation_confidence: number | null; last_synced_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
};

// --- Campaign type (if not already defined) ---
export type CmsCampaign = {
  id: string; tenant_id: string; name: string; description: string | null;
  campaign_type: "content" | "banner" | "popup" | "email" | "social" | "ad";
  status: "draft" | "scheduled" | "active" | "paused" | "completed" | "cancelled";
  content_block_ids: string[]; target_segment_ids: string[];
  start_date: string | null; end_date: string | null;
  schedule_config: Record<string, any>; metrics: Record<string, any>;
  created_by: string | null; created_at: string; updated_at: string;
};

// --- Navigation Item CRUD ---
export async function createNavigationItem(item: {
  menu_id: string; label: string; href: string; item_type?: string;
  sort_order?: number; badge?: string; icon?: string;
}): Promise<CmsNavigationItem | null> {
  const t = TENANT(); if (!t) return null;
  const rows = await pgQuery<CmsNavigationItem>(
    `INSERT INTO public.cms_navigation_items (tenant_id, menu_id, parent_id, label, href, item_type, columns, slots, icon, badge, sort_order, status)
     VALUES ($1,$2,NULL,$3,$4,$5,1,'{}',$6,$7,$8,'active') RETURNING *`,
    [t, item.menu_id, item.label, item.href, item.item_type || "direct_link", item.icon || null, item.badge || null, item.sort_order || 0]);
  return rows[0] ?? null;
}

export async function updateNavigationItem(id: string, patch: Partial<CmsNavigationItem>): Promise<CmsNavigationItem | null> {
  const t = TENANT(); if (!t) return null;
  const sets: string[] = []; const params: unknown[] = [t, id]; let i = 3;
  if (patch.label !== undefined) { sets.push(`label = $${i++}`); params.push(patch.label); }
  if (patch.href !== undefined) { sets.push(`href = $${i++}`); params.push(patch.href); }
  if (patch.sort_order !== undefined) { sets.push(`sort_order = $${i++}`); params.push(patch.sort_order); }
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); params.push(patch.status); }
  if (sets.length === 0) return null;
  sets.push(`updated_at = now()`);
  const rows = await pgQuery<CmsNavigationItem>(
    `UPDATE public.cms_navigation_items SET ${sets.join(", ")} WHERE tenant_id = $1 AND id = $2 RETURNING *`, params);
  return rows[0] ?? null;
}

export async function deleteNavigationItem(id: string): Promise<boolean> {
  const t = TENANT(); if (!t) return false;
  await pgQuery(`DELETE FROM public.cms_navigation_items WHERE tenant_id = $1 AND id = $2`, [t, id]);
  return true;
}

// --- Design Token CRUD ---
export async function createDesignToken(token: {
  category: string; token_key: string; token_value: string; label?: string;
}): Promise<CmsDesignToken | null> {
  const t = TENANT(); if (!t) return null;
  const rows = await pgQuery<CmsDesignToken>(
    `INSERT INTO public.cms_design_tokens (tenant_id, category, token_key, token_value, label, scope, sort_order, status)
     VALUES ($1,$2,$3,$4,$5,'global',0,'active') RETURNING *`,
    [t, token.category, token.token_key, token.token_value, token.label || token.token_key]);
  return rows[0] ?? null;
}

export async function updateDesignToken(id: string, patch: { token_value?: string; label?: string }): Promise<CmsDesignToken | null> {
  const t = TENANT(); if (!t) return null;
  const sets: string[] = []; const params: unknown[] = [t, id]; let i = 3;
  if (patch.token_value !== undefined) { sets.push(`token_value = $${i++}`); params.push(patch.token_value); }
  if (patch.label !== undefined) { sets.push(`label = $${i++}`); params.push(patch.label); }
  if (sets.length === 0) return null;
  sets.push(`updated_at = now()`);
  const rows = await pgQuery<CmsDesignToken>(
    `UPDATE public.cms_design_tokens SET ${sets.join(", ")} WHERE tenant_id = $1 AND id = $2 RETURNING *`, params);
  return rows[0] ?? null;
}

// --- Global Copy CRUD ---
export async function createGlobalCopy(item: {
  copy_key: string; copy_value: string; locale?: string; context?: string;
}): Promise<CmsGlobalCopy | null> {
  const t = TENANT(); if (!t) return null;
  const rows = await pgQuery<CmsGlobalCopy>(
    `INSERT INTO public.cms_global_copy (tenant_id, copy_key, copy_value, locale, context, status)
     VALUES ($1,$2,$3,$4,$5,'active') RETURNING *`,
    [t, item.copy_key, item.copy_value, item.locale || "en-US", item.context || null]);
  return rows[0] ?? null;
}

export async function updateGlobalCopy(id: string, patch: { copy_value?: string; status?: string }): Promise<CmsGlobalCopy | null> {
  const t = TENANT(); if (!t) return null;
  const sets: string[] = []; const params: unknown[] = [t, id]; let i = 3;
  if (patch.copy_value !== undefined) { sets.push(`copy_value = $${i++}`); params.push(patch.copy_value); }
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); params.push(patch.status); }
  if (sets.length === 0) return null;
  sets.push(`updated_at = now()`);
  const rows = await pgQuery<CmsGlobalCopy>(
    `UPDATE public.cms_global_copy SET ${sets.join(", ")} WHERE tenant_id = $1 AND id = $2 RETURNING *`, params);
  return rows[0] ?? null;
}

// --- Offer CRUD ---
export async function createOffer(offer: {
  code: string; name: string; offer_type: string; value: string;
}): Promise<CmsOffer | null> {
  const t = TENANT(); if (!t) return null;
  const rows = await pgQuery<CmsOffer>(
    `INSERT INTO public.cms_offers (tenant_id, code, name, offer_type, value, conditions, status)
     VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,'draft') RETURNING *`,
    [t, offer.code, offer.name, offer.offer_type, offer.value]);
  return rows[0] ?? null;
}

// --- Redirect CRUD ---
export async function createRedirect(redirect: {
  from_url: string; to_url: string; status_code?: number;
}): Promise<CmsRedirect | null> {
  const t = TENANT(); if (!t) return null;
  const rows = await pgQuery<CmsRedirect>(
    `INSERT INTO public.cms_redirects (tenant_id, from_url, to_url, status_code, active)
     VALUES ($1,$2,$3,$4,true) RETURNING *`,
    [t, redirect.from_url, redirect.to_url, redirect.status_code || 301]);
  return rows[0] ?? null;
}
