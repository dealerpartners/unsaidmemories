/**
 * Seed for the Integrations module (build/integrations).
 *
 * - Creates the integrations admin user in Supabase Auth (idempotent)
 *   and a portal_users row with the integrations role for this tenant.
 * - Seeds sample social posts (scheduled / draft / failed-with-real-error)
 *   against real products, with per-network fan-out rows.
 * - Seeds two partner portals when the partner_portals table exists
 *   (added by supabase/migrations/20261030010000_integrations_social_partner.sql);
 *   skips with a note when the migration has not been applied yet.
 *
 * Credentials are read from the worktree .env at runtime and never
 * printed. The seed password comes from SEED_INTEGRATIONS_PASSWORD or
 * falls back to the shared build pattern (reported in the agent handoff
 * only, never committed anywhere else).
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (t && !t.startsWith("#") && t.includes("=")) {
    const i = t.indexOf("=");
    env[t.slice(0, i)] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
const URL_BASE = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env");
const TENANT_ID = "652fd2be-d19a-4778-835d-db38094d7718";
const EMAIL = "integrations.admin@unsaid.local";
const PASSWORD = process.env.SEED_INTEGRATIONS_PASSWORD || "Unsaid!Integrations2026";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

async function ensureUser() {
  const users = await rest(`/auth/v1/admin/users?per_page=200`);
  let user = (users.users || []).find((u) => u.email === EMAIL);
  if (!user) {
    user = await rest(`/auth/v1/admin/users`, {
      method: "POST",
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Integrations Admin", role: "integrations" },
      }),
    });
    console.log("created auth user:", EMAIL);
  } else {
    console.log("auth user exists:", EMAIL);
  }
  const existing = await rest(
    `/rest/v1/portal_users?user_id=eq.${user.id}&tenant_id=eq.${TENANT_ID}&select=id`
  );
  if (!existing.length) {
    const base = {
      user_id: user.id,
      tenant_id: TENANT_ID,
      email: EMAIL,
      display_name: "Integrations Admin",
      is_active: true,
      portal: "admin",
    };
    try {
      await rest(`/rest/v1/portal_users`, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ...base, role_type: "Admin" }),
      });
    } catch {
      await rest(`/rest/v1/portal_users`, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ...base, role_type: "Manager" }),
      });
    }
    console.log("portal_users row created (active)");
  }
  // Best-effort: the gate also accepts a platform_admins row, but that
  // table's shape is owned by the System build — never fail the seed on it.
  try {
    const admins = await rest(
      `/rest/v1/platform_admins?user_id=eq.${user.id}&select=user_id`
    );
    if (!admins.length) {
      await rest(`/rest/v1/platform_admins`, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: user.id,
          tenant_id: TENANT_ID,
          reason: "Integrations build seed — module admin for browser verification",
        }),
      });
      console.log("platform_admins row created");
    }
  } catch (err) {
    console.log("platform_admins step skipped:", String(err.message).slice(0, 100));
  }
  return user;
}

async function productImage(db, productId) {
  const variants = await rest(
    `/rest/v1/product_variants?product_id=eq.${productId}&select=id&limit=5`
  );
  for (const v of variants) {
    const routes = await rest(
      `/rest/v1/variant_fulfillment_routes?product_variant_id=eq.${v.id}&is_active=eq.true&select=supplier_catalog_variant_id&order=priority&limit=1`
    );
    if (!routes.length) continue;
    const catVar = await rest(
      `/rest/v1/supplier_catalog_variants?id=eq.${routes[0].supplier_catalog_variant_id}&select=supplier_catalog_product_id`
    );
    if (!catVar.length) continue;
    const catProd = await rest(
      `/rest/v1/supplier_catalog_products?id=eq.${catVar[0].supplier_catalog_product_id}&select=image_url`
    );
    if (catProd[0]?.image_url) return catProd[0].image_url;
  }
  return null;
}

async function seedPosts() {
  const existing = await rest(
    `/rest/v1/social_posts?tenant_id=eq.${TENANT_ID}&select=id`
  );
  if (existing.length >= 5) {
    console.log("social_posts already seeded — skipping");
    return;
  }
  if (existing.length) {
    // Partial seed from an interrupted run — clear and reseed cleanly.
    await rest(`/rest/v1/social_post_networks?tenant_id=eq.${TENANT_ID}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).catch(() => {});
    await rest(`/rest/v1/social_posts?tenant_id=eq.${TENANT_ID}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    console.log("cleared partial social_posts seed");
  }
  const products = await rest(
    `/rest/v1/products?tenant_id=eq.${TENANT_ID}&select=id,name,slug,status&order=created_at.desc&limit=8`
  );
  if (!products.length) {
    console.log("no products to seed posts against — skipping posts");
    return;
  }
  const day = 86_400_000;
  const now = Date.now();
  const plan = [
    { days: 1, hour: 10, status: "scheduled", caption: (p) => `Tomorrow's feature: ${p.name}. Made to order, made to mean something.`, networks: ["instagram", "facebook"] },
    { days: 2, hour: 14, status: "scheduled", caption: (p) => `${p.name} — the story you can hold. Now in the shop.`, networks: ["x"] },
    { days: 4, hour: 9, status: "scheduled", caption: (p) => `Weekend pick: ${p.name}. Save it, share it, gift it.`, networks: ["pinterest", "instagram"] },
    { days: 0, hour: 0, status: "draft", caption: (p) => `Draft announcement for ${p.name} — final copy to be approved.`, networks: ["facebook"] },
    { days: -1, hour: 11, status: "failed", caption: (p) => `${p.name} has arrived.`, networks: ["instagram"], error: "instagram: No connected instagram account. Connect one in Integrations." },
  ];
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    const product = products[i % products.length];
    const when = new Date(now + step.days * day);
    when.setHours(step.hour, 0, 0, 0);
    const image = await productImage(null, product.id);
    const [post] = await rest(`/rest/v1/social_posts`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        source_type: "product",
        source_id: product.id,
        caption: step.caption(product),
        media_urls: image ? [image] : [],
        product_url: `https://unsaidmemories.com/product/${product.slug}`,
        scheduled_at: when.toISOString(),
        status: step.status,
        error: step.error ?? null,
      }),
    });
    // Only native columns here — the per-network `error` column arrives
    // with the integrations migration; the post-level error carries it.
    // Row statuses follow the schema check: draft | scheduled | published | failed.
    const rows = step.networks.map((network) => ({
      social_post_id: post.id,
      tenant_id: TENANT_ID,
      network,
      status:
        step.status === "failed" ? "failed" : step.status === "draft" ? "draft" : "scheduled",
    }));
    await rest(`/rest/v1/social_post_networks`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
    console.log(`seeded ${step.status} post for "${product.name}" → ${step.networks.join(", ")}`);
  }
}

async function seedPortals() {
  try {
    const existing = await rest(`/rest/v1/partner_portals?tenant_id=eq.${TENANT_ID}&select=id&limit=1`);
    if (existing.length) {
      console.log("partner portals already seeded — skipping");
      return;
    }
    await rest(`/rest/v1/partner_portals`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        { tenant_id: TENANT_ID, name: "Unsaid Wholesale Partners", slug: "unsaid-wholesale-partners", kind: "storefront", status: "active" },
        { tenant_id: TENANT_ID, name: "Kin Keeper Showcase", slug: "kin-keeper-showcase", kind: "showcase", status: "active" },
      ]),
    });
    console.log("seeded 2 partner portals");
  } catch (err) {
    console.log("partner portals skipped:", String(err.message).slice(0, 120), "(migration not applied yet)");
  }
}

await ensureUser();
await seedPosts();
await seedPortals();
console.log("seed-integrations done");
