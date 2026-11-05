import { createServerClient } from "@/lib/supabase";
import { TENANT_ID } from "@/lib/admin/gate";
import { publishToNetwork, type SocialAccountRow } from "./publish";
import { appBaseUrl } from "./providers";

/** Data + scheduling engine for social posts, suppliers, partner portals. */

type Db = ReturnType<typeof createServerClient>;

// ── Accounts ────────────────────────────────────────────────────────

export async function listAccounts(db: Db) {
  const full = await db
    .from("social_accounts")
    .select(
      "id, network, handle, display_name, avatar_url, status, external_account_id, token_expires_at, scopes, created_at, updated_at"
    )
    .eq("tenant_id", TENANT_ID)
    .order("network")
    .order("created_at");
  if (!full.error) return full.data ?? [];
  // Pre-migration fallback: native columns only.
  const { data } = await db
    .from("social_accounts")
    .select("id, network, handle, status, created_at")
    .eq("tenant_id", TENANT_ID)
    .order("network")
    .order("created_at");
  return (data ?? []).map((a) => ({
    ...a,
    display_name: null,
    avatar_url: null,
    external_account_id: null,
    token_expires_at: null,
    scopes: null,
    updated_at: null,
  }));
}

export async function disconnectAccount(db: Db, id: string) {
  const { error } = await db
    .from("social_accounts")
    .update({ status: "disconnected" })
    .eq("id", id)
    .eq("tenant_id", TENANT_ID);
  if (error) throw new Error(error.message);
  // Wipe stored tokens (columns arrive with the migration — best effort).
  await db
    .from("social_accounts")
    .update({
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", TENANT_ID);
}

// ── Posts ───────────────────────────────────────────────────────────

export interface PostNetworkTarget {
  network: string;
  accountId?: string | null;
}

export interface CreatePostInput {
  caption: string;
  mediaUrls: string[];
  productId?: string | null;
  productUrl?: string | null;
  targets: PostNetworkTarget[];
  scheduledAt?: string | null;
  publishNow?: boolean;
}

export async function createPost(db: Db, input: CreatePostInput) {
  if (!input.caption.trim()) throw new Error("Caption is required.");
  if (input.targets.length === 0) throw new Error("Pick at least one network.");
  const status = input.publishNow
    ? "publishing"
    : input.scheduledAt
      ? "scheduled"
      : "draft";
  const { data: post, error } = await db
    .from("social_posts")
    .insert({
      tenant_id: TENANT_ID,
      source_type: input.productId ? "product" : "custom",
      source_id: input.productId ?? null,
      caption: input.caption,
      media_urls: input.mediaUrls,
      product_url: input.productUrl ?? null,
      scheduled_at: input.publishNow ? new Date().toISOString() : input.scheduledAt,
      status,
    })
    .select("id")
    .single();
  if (error || !post) throw new Error(error?.message ?? "Could not create the post.");
  const rows = input.targets.map((t) => ({
    social_post_id: post.id,
    tenant_id: TENANT_ID,
    network: t.network,
    social_account_id: t.accountId ?? null,
    status: status === "draft" ? "draft" : "scheduled",
  }));
  const { error: nErr } = await db.from("social_post_networks").insert(rows);
  if (nErr) throw new Error(nErr.message);
  if (input.publishNow) {
    await dispatchPost(db, post.id);
  }
  return post.id;
}

export async function listPosts(
  db: Db,
  opts: { from?: string; to?: string; productId?: string } = {}
) {
  let q = db
    .from("social_posts")
    .select(
      "id, source_type, source_id, caption, media_urls, product_url, scheduled_at, status, error, published_at, approved_by, created_at"
    )
    .eq("tenant_id", TENANT_ID)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (opts.from) q = q.gte("scheduled_at", opts.from);
  if (opts.to) q = q.lte("scheduled_at", opts.to);
  if (opts.productId) q = q.eq("source_id", opts.productId);
  const { data: posts } = await q;
  if (!posts?.length) return [];
  const ids = posts.map((p) => p.id);
  let netsRes = await db
    .from("social_post_networks")
    .select("social_post_id, network, status, external_url, error, social_account_id")
    .in("social_post_id", ids);
  if (netsRes.error) {
    netsRes = (await db
      .from("social_post_networks")
      .select("social_post_id, network, status")
      .in("social_post_id", ids)) as typeof netsRes;
  }
  const nets = netsRes.data;
  return posts.map((p) => ({
    ...p,
    networks: (nets ?? [])
      .filter((n) => n.social_post_id === p.id)
      .map((n) => ({
        ...n,
        external_url: (n as { external_url?: string | null }).external_url ?? null,
        error: (n as { error?: string | null }).error ?? null,
        social_account_id: (n as { social_account_id?: string | null }).social_account_id ?? null,
      })),
  }));
}

export async function reschedulePost(db: Db, id: string, when: string) {
  const { error } = await db
    .from("social_posts")
    .update({ scheduled_at: when, status: "scheduled", error: null })
    .eq("id", id)
    .eq("tenant_id", TENANT_ID)
    .in("status", ["scheduled", "draft", "failed"]);
  if (error) throw new Error(error.message);
}

export async function cancelPost(db: Db, id: string) {
  const { error } = await db
    .from("social_posts")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("tenant_id", TENANT_ID)
    .in("status", ["scheduled", "draft", "failed"]);
  if (error) throw new Error(error.message);
  await db
    .from("social_post_networks")
    .update({ status: "draft" })
    .eq("social_post_id", id)
    .eq("status", "scheduled");
}

export async function approvePost(db: Db, id: string, userId: string) {
  const { error } = await db
    .from("social_posts")
    .update({ approved_by: userId })
    .eq("id", id)
    .eq("tenant_id", TENANT_ID);
  if (error) throw new Error(error.message);
}

export async function deletePost(db: Db, id: string) {
  const { error } = await db
    .from("social_posts")
    .delete()
    .eq("id", id)
    .eq("tenant_id", TENANT_ID)
    .in("status", ["draft", "cancelled", "failed"]);
  if (error) throw new Error(error.message);
}

/** Update a fan-out row; pre-migration the row has no error column, so
 *  fall back to a status-only update (the post row keeps the error). */
async function updateNetworkRow(
  db: Db,
  postId: string,
  network: string,
  patch: { status: string; error?: string | null }
) {
  const full = await db
    .from("social_post_networks")
    .update(patch)
    .eq("social_post_id", postId)
    .eq("network", network);
  if (full.error) {
    await db
      .from("social_post_networks")
      .update({ status: patch.status })
      .eq("social_post_id", postId)
      .eq("network", network);
  }
}

/** Publish one post to each of its pending networks; record every result. */
export async function dispatchPost(db: Db, postId: string): Promise<{ published: number; failed: number }> {
  const { data: post } = await db
    .from("social_posts")
    .select("id, caption, media_urls, product_url, status")
    .eq("id", postId)
    .eq("tenant_id", TENANT_ID)
    .single();
  if (!post) throw new Error("Post not found.");
  // social_account_id arrives with the integrations migration; fall back
  // to the native column set until it is applied.
  let netsRes = await db
    .from("social_post_networks")
    .select("social_post_id, network, status, social_account_id")
    .eq("social_post_id", postId)
    .eq("status", "scheduled");
  if (netsRes.error) {
    netsRes = (await db
      .from("social_post_networks")
      .select("social_post_id, network, status")
      .eq("social_post_id", postId)
      .eq("status", "scheduled")) as typeof netsRes;
  }
  const nets = netsRes.data;
  let published = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const net of nets ?? []) {
    let account: SocialAccountRow | null = null;
    const accountCols =
      "id, network, external_account_id, handle, access_token_encrypted, refresh_token_encrypted, token_expires_at, status, metadata";
    let query = db
      .from("social_accounts")
      .select(accountCols)
      .eq("tenant_id", TENANT_ID)
      .eq("network", net.network)
      .eq("status", "connected");
    if (net.social_account_id) query = query.eq("id", net.social_account_id);
    const { data: accounts } = await query.limit(1);
    if (accounts?.length) {
      account = accounts[0] as SocialAccountRow;
    } else if (accounts === null) {
      // Pre-migration fallback: native columns only (no token storage yet,
      // so any account found will fail publishing with a clear error).
      const fallback = await db
        .from("social_accounts")
        .select("id, network, handle, status")
        .eq("tenant_id", TENANT_ID)
        .eq("network", net.network)
        .eq("status", "connected")
        .limit(1);
      const row = fallback.data?.[0];
      if (row) {
        account = {
          ...row,
          external_account_id: null,
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          token_expires_at: null,
          metadata: {},
        } as SocialAccountRow;
      }
    }
    if (!account) {
      failed++;
      errors.push(`${net.network}: no connected account`);
      await updateNetworkRow(db, postId, net.network, {
        status: "failed",
        error: `No connected ${net.network} account. Connect one in Integrations.`,
      });
      continue;
    }
    try {
      const result = await publishToNetwork(account, {
        caption: post.caption,
        mediaUrls: post.media_urls ?? [],
        productUrl: post.product_url,
      });
      published++;
      await updateNetworkRow(db, postId, net.network, { status: "published", error: null });
      // Extended delivery fields arrive with the migration — best effort.
      await db
        .from("social_post_networks")
        .update({
          external_post_id: result.externalId,
          external_url: result.externalUrl ?? null,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("social_post_id", postId)
        .eq("network", net.network);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${net.network}: ${message}`);
      await updateNetworkRow(db, postId, net.network, { status: "failed", error: message });
    }
  }
  const total = (nets ?? []).length;
  // Schema vocabulary: any delivered network makes the post "published"
  // (per-network failures stay on their rows + the post error field);
  // zero delivered makes it "failed".
  const status = total === 0 ? post.status : published > 0 ? "published" : "failed";
  await db
    .from("social_posts")
    .update({
      status,
      error: errors.length ? errors.join(" · ") : null,
      published_at: published > 0 ? new Date().toISOString() : null,
    })
    .eq("id", postId);
  return { published, failed };
}

/** Cron entry point: publish every scheduled post whose time has come. */
export async function dispatchDuePosts(db: Db): Promise<{ posts: number; published: number; failed: number }> {
  const { data: due } = await db
    .from("social_posts")
    .select("id")
    .eq("tenant_id", TENANT_ID)
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(50);
  let published = 0;
  let failed = 0;
  for (const row of due ?? []) {
    const r = await dispatchPost(db, row.id);
    published += r.published;
    failed += r.failed;
  }
  return { posts: (due ?? []).length, published, failed };
}

// ── Supplier health ─────────────────────────────────────────────────

const SUPPLIER_CREDENTIALS: Record<string, string[]> = {
  printful: ["PRINTFUL_API_KEY"],
  gelato: ["GELATO_API_KEY"],
  prodigi: ["PRODIGI_API_KEY"],
  gooten: ["GOOTEN_RECIPE_ID", "GOOTEN_PARTNER_BILLING_KEY"],
  teemill: ["TEEMILL_PUBLIC_SAFE_KEY"],
  spreadconnect: ["SPREADCONNECT_API_KEY"],
  spreadshirt: ["SPREADCONNECT_API_KEY"],
};

export interface SupplierHealthRow {
  id: string;
  name: string;
  slug: string;
  kind: string | null;
  catalog_source: string | null;
  api_base_url: string | null;
  ordering_status: string | null;
  created_at: string;
  credentialsSet: boolean;
  credentialKeys: string[];
  catalogProducts: number;
  lastSync: { at: string; status: string; imported: number | null; total: number | null; error: string | null } | null;
  health: string;
}

export async function supplierHealth(db: Db): Promise<SupplierHealthRow[]> {
  const { data: suppliers } = await db
    .from("suppliers")
    .select("id, name, slug, kind, catalog_source, api_base_url, ordering_status, created_at")
    .order("name");
  const out: SupplierHealthRow[] = [];
  for (const s of suppliers ?? []) {
    const credKeys = SUPPLIER_CREDENTIALS[s.slug] ?? [];
    const credentialsSet = credKeys.length > 0 && credKeys.every((k) => !!process.env[k]);
    const { count: catalogCount } = await db
      .from("supplier_catalog_products")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", s.id);
    const { data: imports } = await db
      .from("supplier_imports")
      .select("status, imported_rows, total_rows, created_at, error")
      .eq("supplier_id", s.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = imports?.[0] ?? null;
    out.push({
      ...s,
      credentialsSet,
      credentialKeys: credKeys,
      catalogProducts: catalogCount ?? 0,
      lastSync: last
        ? { at: last.created_at, status: last.status, imported: last.imported_rows, total: last.total_rows, error: last.error }
        : null,
      health: !credentialsSet
        ? "no_credentials"
        : (catalogCount ?? 0) === 0
          ? "credentials_no_catalog"
          : last?.status === "failed"
            ? "sync_failed"
            : "connected",
    });
  }
  return out;
}

// ── Partner portals ─────────────────────────────────────────────────

export async function listPortals(db: Db) {
  const { data } = await db
    .from("partner_portals")
    .select("id, name, slug, kind, ingest_url, site_url, status, created_at")
    .eq("tenant_id", TENANT_ID)
    .order("name");
  return data ?? [];
}

export async function createPortal(
  db: Db,
  input: { name: string; kind?: string; ingestUrl?: string; siteUrl?: string }
) {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { data, error } = await db
    .from("partner_portals")
    .insert({
      tenant_id: TENANT_ID,
      name: input.name,
      slug,
      kind: input.kind ?? "storefront",
      ingest_url: input.ingestUrl || null,
      site_url: input.siteUrl || null,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the portal.");
  return data.id;
}

export async function listPushes(db: Db, productId?: string) {
  let q = db
    .from("partner_pushes")
    .select("id, portal_id, product_id, status, external_id, external_url, error, pushed_at, created_at")
    .eq("tenant_id", TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(100);
  if (productId) q = q.eq("product_id", productId);
  const { data } = await q;
  return data ?? [];
}

export async function pushProductToPortal(db: Db, portalId: string, productId: string, req?: Request) {
  const { data: portal } = await db
    .from("partner_portals")
    .select("id, name, ingest_url, status")
    .eq("id", portalId)
    .eq("tenant_id", TENANT_ID)
    .single();
  if (!portal) throw new Error("Partner portal not found.");
  if (portal.status !== "active") throw new Error("This partner portal is not active.");
  const { data: product } = await db
    .from("products")
    .select("id, name, slug, description, status")
    .eq("id", productId)
    .eq("tenant_id", TENANT_ID)
    .single();
  if (!product) throw new Error("Product not found.");
  if (product.status !== "published") {
    throw new Error(`Only published products can be pushed (this one is "${product.status}").`);
  }
  const { data: variants } = await db
    .from("product_variants")
    .select("id, sku, size, color, price")
    .eq("product_id", productId)
    .eq("is_active", true);
  const base = appBaseUrl(req);
  const payload = {
    external_id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    url: `${base}/product/${product.slug}`,
    variants: (variants ?? []).map((v) => ({
      sku: v.sku, size: v.size, color: v.color, price: v.price,
    })),
    pushed_at: new Date().toISOString(),
  };
  const { data: push, error } = await db
    .from("partner_pushes")
    .insert({ tenant_id: TENANT_ID, portal_id: portalId, product_id: productId, status: "queued", payload })
    .select("id")
    .single();
  if (error || !push) throw new Error(error?.message ?? "Could not record the push.");
  if (!portal.ingest_url) {
    await db
      .from("partner_pushes")
      .update({
        status: "recorded",
        error: "Portal has no ingest endpoint configured; the push is recorded and will send once an ingest URL is set.",
      })
      .eq("id", push.id);
    return { pushId: push.id, status: "recorded" as const };
  }
  try {
    const res = await fetch(portal.ingest_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new Error(`Portal responded ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    await db
      .from("partner_pushes")
      .update({
        status: "pushed",
        external_id: json.id ? String(json.id) : json.external_id ? String(json.external_id) : null,
        external_url: json.url ? String(json.url) : null,
        pushed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", push.id);
    return { pushId: push.id, status: "pushed" as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("partner_pushes")
      .update({ status: "failed", error: message })
      .eq("id", push.id);
    return { pushId: push.id, status: "failed" as const, error: message };
  }
}
