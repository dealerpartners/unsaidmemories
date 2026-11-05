// Site policies — the ONE policy store (BL-13 twin-store consolidation).
//
// Policies live in exactly one store now: public.seller_policies (with
// seller_policy_versions + seller_policy_precedence — the table family
// the owner's tree names for policies). This module is the pg-side
// reader/writer for the SITE policy set — the platform's own legal /
// site policies — inside that store:
//   - /api/admin/policies (admin CRUD surface)
//   - /api/admin/cms/actions upsertPolicy (CMS Quick Actions)
//   - /api/employee/policies (staff read leg)
//   - repo "policies" resource (public rendering, PostgREST leg in
//     src/lib/repo.ts — same store, same published set)
// Site policies are written with layer 'Policy' and category
// 'Site policy', alongside the marketplace/seller policy layers, so the
// F4 contract holds: one policy set, written once in the admin, read by
// all four portals.
//
// The twin this replaces: site policies previously lived as
// doc_articles(content_type='policy') in the Document Center doc store
// (the S1 consolidation), while seller_policies carried the marketplace
// set — two stores for the tree's single "policies" table. The doc
// store keeps every other document type; its policy content-type is
// retired as a policy store (existing rows are a data migration step,
// named for the coordinator — no code here reads them anymore).

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export function slugifyPolicyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export interface SitePolicy {
  id: string;
  title: string;
  body: string | null;
  order: number | null;
  slug: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  tenant_id: string;
}

export function mapSellerPolicy(row: any): SitePolicy {
  return {
    id: String(row.id),
    title: row.title,
    body: row.body ?? null,
    // seller_policies carries no sort column; list order is title order.
    order: null,
    slug: row.slug,
    status: row.status,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    tenant_id: row.tenant_id,
  };
}

const POLICY_COLS = `id, tenant_id, title, slug, body, status, created_at, updated_at`;
const SITE_POLICY_LAYER = "Policy";
const SITE_POLICY_CATEGORY = "Site policy";

/** All SITE policies for a tenant (any status — admin view). One store,
 * layered sets: the site set is the rows carrying this writer's
 * category stamp (the data step stamps the migrated doc-store rows the
 * same way); the marketplace/seller layers keep their own faces over
 * the same table. */
export async function listSitePolicies(c: PgClient, tenant: string): Promise<SitePolicy[]> {
  const { rows } = await c.query(
    `SELECT ${POLICY_COLS} FROM public.seller_policies
      WHERE tenant_id = $1 AND category = $2
      ORDER BY title ASC`,
    [tenant, SITE_POLICY_CATEGORY],
  );
  return rows.map(mapSellerPolicy);
}

/** Published site policies only — the public / employee read contract. */
export async function listPublishedSitePolicies(c: PgClient, tenant: string): Promise<SitePolicy[]> {
  const { rows } = await c.query(
    `SELECT ${POLICY_COLS} FROM public.seller_policies
      WHERE tenant_id = $1 AND status = 'published' AND category = $2
      ORDER BY title ASC`,
    [tenant, SITE_POLICY_CATEGORY],
  );
  return rows.map(mapSellerPolicy);
}

export async function getSitePolicy(c: PgClient, tenant: string, id: string): Promise<SitePolicy | null> {
  const { rows } = await c.query(
    `SELECT ${POLICY_COLS} FROM public.seller_policies
      WHERE tenant_id = $1 AND id::text = $2 LIMIT 1`,
    [tenant, id],
  );
  return rows[0] ? mapSellerPolicy(rows[0]) : null;
}

async function mintNextVersion(c: PgClient, tenant: string, policy: any, changeNote: string): Promise<void> {
  const next = Number(policy.current_version ?? 0) + 1;
  await c.query(
    `INSERT INTO public.seller_policy_versions
       (tenant_id, policy_id, version, body, change_notes, published_at)
     VALUES ($1, $2::uuid, $3, $4, $5, now())`,
    [tenant, policy.id, next, policy.body, changeNote],
  );
  await c.query(
    `UPDATE public.seller_policies SET current_version = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, policy.id, next],
  );
}

/** Create a published site policy + version 1 (legacy live-on-save semantics). */
export async function createSitePolicy(
  c: PgClient, tenant: string, title: string, body: string,
): Promise<SitePolicy> {
  const slug = slugifyPolicyTitle(title);
  const { rows } = await c.query(
    `INSERT INTO public.seller_policies
       (tenant_id, title, slug, layer, category, body, status, current_version)
     VALUES ($1, $2, $3, $4, $5, $6, 'published', 0)
     RETURNING ${POLICY_COLS}, current_version`,
    [tenant, title, slug, SITE_POLICY_LAYER, SITE_POLICY_CATEGORY, body],
  );
  const policy = rows[0];
  await mintNextVersion(c, tenant, policy, "Created via site-policy writer");
  return mapSellerPolicy(policy);
}

/** Update title/body; a published policy gets a fresh version row. */
export async function updateSitePolicy(
  c: PgClient, tenant: string, id: string, title: string, body: string,
): Promise<SitePolicy | null> {
  const slug = slugifyPolicyTitle(title);
  const { rows } = await c.query(
    `UPDATE public.seller_policies
        SET title = $3, body = $4, slug = $5, updated_at = now()
      WHERE tenant_id = $1 AND id::text = $2
      RETURNING ${POLICY_COLS}, current_version`,
    [tenant, id, title, body, slug],
  );
  if (!rows[0]) return null;
  if (rows[0].status === "published") {
    await mintNextVersion(c, tenant, rows[0], "Edited via site-policy writer");
  }
  return mapSellerPolicy(rows[0]);
}

/** Find-or-create/update by slugified title — the CMS Quick Action contract. */
export async function upsertSitePolicy(
  c: PgClient, tenant: string, title: string, body: string | null,
): Promise<{ policy: SitePolicy; created: boolean }> {
  const slug = slugifyPolicyTitle(title);
  const { rows: existing } = await c.query(
    `SELECT ${POLICY_COLS}, current_version FROM public.seller_policies
      WHERE tenant_id = $1 AND slug = $2 LIMIT 1`,
    [tenant, slug],
  );
  if (existing[0]) {
    const { rows } = await c.query(
      `UPDATE public.seller_policies
          SET title = $3, body = COALESCE($4, body), updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid
        RETURNING ${POLICY_COLS}, current_version`,
      [tenant, existing[0].id, title, body],
    );
    const updated = rows[0];
    if (updated?.status === "published" && body !== null && body !== existing[0].body) {
      await mintNextVersion(c, tenant, updated, "Edited via CMS Quick Action");
    }
    return { policy: mapSellerPolicy(updated), created: false };
  }
  const created = await createSitePolicy(c, tenant, title, body ?? "");
  return { policy: created, created: true };
}
