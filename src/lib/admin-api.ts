/**
 * Admin API shared helper — Supabase REST via service role key.
 *
 * Standard contract (Agent A hooks depend on this):
 *   GET list   -> { data: T[], total: number }            (+ optional legacy alias)
 *   GET single -> { data: T }                              (404 if missing)
 *   POST       -> { data: T }                              (201)
 *   PATCH      -> { data: T }
 *   DELETE     -> { success: true }
 *   Errors     -> { error: string } with proper HTTP status
 *
 * Rules:
 * - tenant_id is always filtered/injected unless the table lacks the column
 *   (auto-fallback: on 400 mentioning tenant_id, retry without it).
 * - Missing/unexposed tables return { data: [], total: 0, _empty: true } — never crash.
 * - The LMS pg-native path is NOT ported (Learn module excluded);
 *   schema "lms" calls return an honest empty result.
 */
import { NextResponse } from "next/server";
import { requireAdminApi, getAdminIdentity } from "@/lib/admin/gate";
import { resolveTenantId as resolveEnvTenantId } from "@/lib/tenant-id";

// UNSAID ADAPTATION (transplant lane 2, 2026-10-30): UnSaid Memories's version of
// this module resolved the tenant from the caller's session and cookies
// (lib/admin/tenant-resolution, lib/portal-auth) and carried a pg-native
// path for the lms schema. Unsaid has ONE tenant resolution path - the
// environment (SUPABASE_TENANT_ID, the same variable Unsaid's admin gate
// reads) - so resolveTenantId below ignores request state by design.
// The lms path is dropped with the excluded Learn module. The generic
// helpers keep UnSaid Memories's exact response contract over Supabase REST,
// pointed at Unsaid's own project (no UnSaid Memories fallback host).

const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const ADMIN_TENANT_ID = () => resolveEnvTenantId();

/** Kept for contract compatibility with transplanted routes. Unsaid has
 *  no tenant switcher, so nothing reads or writes this cookie. */
export const ACTIVE_TENANT_COOKIE = "portal_active_tenant";

/** The tenant for an admin API request: Unsaid's env tenant, always. */
export function resolveTenantId(_req?: Request): string {
  return ADMIN_TENANT_ID();
}

/** The calling admin's auth user id, for filling author columns on
 *  create - resolved through Unsaid's admin gate identity. Returns null
 *  when no admin identity can be resolved. */
export async function adminAuthorIdFromSession(_cookieHeader?: string | null): Promise<string | null> {
  try {
    const identity = await getAdminIdentity();
    return identity?.userId ?? null;
  } catch {
    return null;
  }
}

export interface AdminListOpts {
  /** The calling route already satisfied its gate for this request —
   *  the helper must not re-gate with a different definition. */
  preGated?: boolean;
  schema?: string;
  search?: string;
  searchCols?: string[];
  limit?: number;
  offset?: number;
  order?: string;
  filters?: Record<string, string>;
  legacyKey?: string;
  noTenant?: boolean;
  pk?: string;
  /** Resolved tenant (e.g. via resolveTenantId(req)) — falls back to ADMIN_TENANT_ID() when omitted. */
  tenantId?: string;
}

export interface AdminRowOpts {
  /** See AdminListOpts.preGated — one definition per gate. */
  preGated?: boolean;
  schema?: string;
  legacyKey?: string;
  noTenant?: boolean;
  pk?: string;
  /** Resolved tenant (e.g. via resolveTenantId(req)) — falls back to ADMIN_TENANT_ID() when omitted. */
  tenantId?: string;
}

function escIlike(s: string): string {
  return s.replace(/[%*,()\\]/g, (m) => `\\${m}`);
}

async function sbFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers || {}),
    },
  });
}

function tablePath(table: string, schema: string): string {
  return schema === "public" ? table : `${schema}.${table}`;
}

function emptyList(note?: string) {
  return NextResponse.json({
    data: [],
    total: 0,
    _empty: true,
    ...(note ? { note } : {}),
  });
}

function withLegacy(payload: Record<string, any>, legacyKey?: string) {
  if (legacyKey && payload.data !== undefined) payload[legacyKey] = payload.data;
  return payload;
}

export async function adminList(table: string, opts: AdminListOpts = {}) {
  // Admin gate (same as the write helpers below): every generic admin
  // read route funnels through here, and until now none of them had a
  // code gate — layout-level gating only. A non-admin caller must be
  // refused before any row is read.
  const gate = opts.preGated ? null : await requireAdminApi();
  if (gate) return gate;
  const {
    schema = "public",
    search = "",
    searchCols = [],
    limit = 100,
    offset = 0,
    order = "created_at.desc",
    filters = {},
    legacyKey,
    noTenant = false,
    pk = "id",
  } = opts;

  if (schema === "lms") return emptyList("lms schema is not part of Unsaid");

  if (!SB_KEY) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const params = new URLSearchParams();
  params.set("select", "*");
  const tid = opts.tenantId || ADMIN_TENANT_ID();
  if (!noTenant) params.set("tenant_id", `eq.${tid}`);
  for (const [k, v] of Object.entries(filters)) params.set(k, `eq.${v}`);
  if (search && searchCols.length > 0) {
    const term = escIlike(search);
    params.set("or", `(${searchCols.map((c) => `${c}.ilike.*${term}*`).join(",")})`);
  }
  params.set("order", order);
  params.set("limit", String(Math.max(1, Math.min(limit || 100, 500))));
  params.set("offset", String(Math.max(0, offset || 0)));

  try {
    const res = await sbFetch(`${tablePath(table, schema)}?${params.toString()}`);
    if (res.status === 404) {
      return emptyList(schema === "lms" ? "lms schema not exposed via PostgREST" : `table ${table} not found`);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (!noTenant && /tenant_id/i.test(txt)) {
        return adminList(table, { ...opts, noTenant: true });
      }
      // Column (e.g. created_at) may not exist for ordering — retry unordered once
      if (/column .* does not exist/i.test(txt) && order !== pk) {
        return adminList(table, { ...opts, order: pk });
      }
      return NextResponse.json({ error: `list ${table} failed: ${txt.slice(0, 220)}` }, { status: 502 });
    }
    const rows = (await res.json()) as any[];
    return NextResponse.json(withLegacy({ data: rows, total: rows.length }, legacyKey));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || `list ${table} failed` }, { status: 500 });
  }
}

export async function adminGet(table: string, id: string, opts: AdminRowOpts = {}) {
  // Admin gate (same as adminList above): every generic admin single-row
  // read funnels through here.
  const gate = opts.preGated ? null : await requireAdminApi();
  if (gate) return gate;
  const { schema = "public", legacyKey, noTenant = false, pk = "id" } = opts;
  if (schema === "lms") return emptyList("lms schema is not part of Unsaid");
  if (!SB_KEY) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set(pk, `eq.${id}`);
  if (!noTenant) params.set("tenant_id", `eq.${opts.tenantId || ADMIN_TENANT_ID()}`);
  params.set("limit", "1");
  try {
    const res = await sbFetch(`${tablePath(table, schema)}?${params.toString()}`);
    if (res.status === 404) return emptyList(schema === "lms" ? "lms schema not exposed via PostgREST" : `table ${table} not found`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (!noTenant && /tenant_id/i.test(txt)) return adminGet(table, id, { ...opts, noTenant: true });
      return NextResponse.json({ error: `get ${table} failed: ${txt.slice(0, 220)}` }, { status: 502 });
    }
    const rows = (await res.json()) as any[];
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(withLegacy({ data: rows[0] }, legacyKey));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || `get ${table} failed` }, { status: 500 });
  }
}

export async function adminCreate(table: string, body: any, opts: AdminRowOpts = {}) {
  // Admin gate (same as /api/admin/lms/publish): every generic admin
  // write route funnels through here, and until now none of them had a
  // code gate — layout-level gating only. A non-admin caller must be
  // refused before any row is written, including on the lms-schema
  // pg-native path below.
  const gate = opts.preGated ? null : await requireAdminApi();
  if (gate) return gate;
  const { schema = "public", legacyKey, noTenant = false, pk = "id" } = opts;
  if (schema === "lms") return NextResponse.json({ error: "lms schema is not part of Unsaid" }, { status: 400 });
  if (!SB_KEY) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const row: Record<string, any> = { ...body };
  delete row[pk]; // never allow client-set PK on create
  if (!noTenant) row.tenant_id = opts.tenantId || ADMIN_TENANT_ID();
  try {
    const res = await sbFetch(tablePath(table, schema), { method: "POST", body: JSON.stringify(row) });
    if (res.status === 404) return emptyList(schema === "lms" ? "lms schema not exposed via PostgREST" : `table ${table} not found`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (!noTenant && /tenant_id/i.test(txt)) {
        delete row.tenant_id;
        return adminCreate(table, body, { ...opts, noTenant: true });
      }
      return NextResponse.json({ error: `create ${table} failed: ${txt.slice(0, 220)}` }, { status: 502 });
    }
    const rows = (await res.json()) as any[];
    // Same honesty rule as the LMS path: a 201 must carry the row the
    // database actually returned, never the unpersisted input.
    if (!rows.length || !rows[0]) {
      return NextResponse.json({ error: `create ${table} failed: insert returned no row` }, { status: 502 });
    }
    return NextResponse.json(withLegacy({ data: rows[0] }, legacyKey), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || `create ${table} failed` }, { status: 500 });
  }
}

export async function adminUpdate(table: string, id: string, body: any, opts: AdminRowOpts = {}) {
  const gate = opts.preGated ? null : await requireAdminApi();
  if (gate) return gate;
  const { schema = "public", legacyKey, noTenant = false, pk = "id" } = opts;
  if (schema === "lms") return NextResponse.json({ error: "lms schema is not part of Unsaid" }, { status: 400 });
  if (!SB_KEY) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const row: Record<string, any> = { ...body };
  delete row[pk];
  delete row.tenant_id; // tenant is immutable via API
  delete row.created_at;
  const params = new URLSearchParams();
  params.set(pk, `eq.${id}`);
  if (!noTenant) params.set("tenant_id", `eq.${opts.tenantId || ADMIN_TENANT_ID()}`);
  try {
    const res = await sbFetch(`${tablePath(table, schema)}?${params.toString()}`, {
      method: "PATCH",
      body: JSON.stringify(row),
    });
    if (res.status === 404) return emptyList(schema === "lms" ? "lms schema not exposed via PostgREST" : `table ${table} not found`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (!noTenant && /tenant_id/i.test(txt)) return adminUpdate(table, id, body, { ...opts, noTenant: true });
      return NextResponse.json({ error: `update ${table} failed: ${txt.slice(0, 220)}` }, { status: 502 });
    }
    const rows = (await res.json()) as any[];
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(withLegacy({ data: rows[0] }, legacyKey));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || `update ${table} failed` }, { status: 500 });
  }
}

export async function adminDelete(table: string, id: string, opts: AdminRowOpts = {}) {
  const gate = opts.preGated ? null : await requireAdminApi();
  if (gate) return gate;
  const { schema = "public", noTenant = false, pk = "id" } = opts;
  if (schema === "lms") return NextResponse.json({ error: "lms schema is not part of Unsaid" }, { status: 400 });
  if (!SB_KEY) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  const params = new URLSearchParams();
  params.set(pk, `eq.${id}`);
  if (!noTenant) params.set("tenant_id", `eq.${opts.tenantId || ADMIN_TENANT_ID()}`);
  try {
    const res = await sbFetch(`${tablePath(table, schema)}?${params.toString()}`, { method: "DELETE" });
    if (res.status === 404) return emptyList(schema === "lms" ? "lms schema not exposed via PostgREST" : `table ${table} not found`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (!noTenant && /tenant_id/i.test(txt)) return adminDelete(table, id, { ...opts, noTenant: true });
      return NextResponse.json({ error: `delete ${table} failed: ${txt.slice(0, 220)}` }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || `delete ${table} failed` }, { status: 500 });
  }
}

/** Parse pagination + search from a request URL. */
export function adminQuery(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  return {
    search: searchParams.get("search") || "",
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0,
    filters: Object.fromEntries(
      // "include" is a route-level expansion directive (e.g. the journal's
      // include=lines), never a column filter — passing it through made
      // PostgREST filter on a nonexistent `include` column and emptied
      // the Books / General Ledger surface (verified live 2026-10-25).
      [...searchParams.entries()].filter(([k]) => !["search", "limit", "offset", "order", "include"].includes(k)),
    ),
    order: searchParams.get("order") || undefined,
  };
}
