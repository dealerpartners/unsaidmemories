import { pgQueryStrict } from "@/lib/pg"
import { MASTER_TENANT_ID } from "@/lib/site-tenant-shared"

// ============================================================================
// The LIVE storefront filter store — the data layer behind /admin/filters.
//
// Since the taxonomy consolidation, the shop reads exactly three stores:
//   • filter groups  = public.attributes          (name, slug)
//   • filter values  = public.attribute_values     (per attribute)
//   • assignments    = public.node_filters         (attribute ↔ taxonomy node)
//   • categories     = public.taxonomy_nodes       (status = 'published')
// and resolves them for shoppers through v_node_filter_spec (assignments
// inherit down the tree). The legacy pet_product_filters /
// pet_product_filter_values / pet_category_filters / pet_product_categories
// tables are no longer read by any storefront path, so the admin editor
// must not write there — edits would land in a store nobody reads.
//
// This module keeps the editor's historical response shapes (the page
// consumes { filters, mappings, categories }) while reading and writing
// ONLY the live tables above, via pg (the same layer taxonomy-db.ts and
// sellers/taxonomy.ts use for this store). pgQueryStrict is used
// throughout: a database failure must surface as an error in the editor,
// never as a silently empty screen.
//
// Two legacy concepts have NO live equivalent and are therefore derived
// or refused, never faked:
//   • "Global" mapping (category_id = null): node_filters always names a
//     node. Assignments inherit to descendants, so mapping to a high
//     node is the live way to cover a subtree. The map route refuses a
//     null category with an explanation instead of dropping the write.
//   • Group is_active / scope: attributes carry neither. is_active is
//     DERIVED (a group is live iff it has ≥1 node_filters assignment)
//     and scope is derived from the same fact. Neither is writable.
// ============================================================================

export type FilterValueShape = {
  id: string
  filter_id: string
  value: string
  slug: string
  display_order: number
}

export type FilterGroupShape = {
  id: string
  name: string
  slug: string
  display_order: number
  is_active: boolean
  scope: string
  values: FilterValueShape[]
}

export type MappingShape = {
  id: string
  filter_id: string
  category_id: string | null
  display_order: number
}

export type CategoryShape = {
  id: string
  name: string
  slug: string
  parent_id: string | null
}

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Make a slug unique within a scope by suffixing -2, -3, … */
async function uniqueSlug(
  base: string,
  probe: (candidate: string) => Promise<boolean>,
): Promise<string> {
  let candidate = base || "filter"
  let n = 2
  while (await probe(candidate)) {
    candidate = `${base}-${n}`
    n += 1
  }
  return candidate
}

type AttributeRow = { id: string; name: string; slug: string }
type ValueRow = { id: string; attribute_id: string; value: string; slug: string; sort_order: number | null }
type MappingRow = { id: string; node_id: string; attribute_id: string; sort_order: number | null }

function groupShape(
  attr: AttributeRow,
  index: number,
  valuesByAttribute: Map<string, FilterValueShape[]>,
  mappingCountByAttribute: Map<string, number>,
): FilterGroupShape {
  const mappingCount = mappingCountByAttribute.get(attr.id) ?? 0
  return {
    id: attr.id,
    name: attr.name,
    slug: attr.slug,
    display_order: index,
    // Derived, not stored: a group reaches the storefront only where it
    // is assigned to a taxonomy node.
    is_active: mappingCount > 0,
    scope: mappingCount > 0 ? "category" : "global",
    values: valuesByAttribute.get(attr.id) ?? [],
  }
}

async function loadParts() {
  const [attributes, values, mappings, categories] = await Promise.all([
    pgQueryStrict<AttributeRow>(
      `SELECT id, name, slug FROM public.attributes ORDER BY name ASC`,
    ),
    pgQueryStrict<ValueRow>(
      `SELECT id, attribute_id, value, slug, sort_order
         FROM public.attribute_values
        ORDER BY sort_order ASC NULLS LAST, value ASC`,
    ),
    pgQueryStrict<MappingRow>(
      `SELECT id, node_id, attribute_id, sort_order
         FROM public.node_filters
        ORDER BY sort_order ASC NULLS LAST, created_at ASC`,
    ),
    pgQueryStrict<CategoryShape & { display_name: string | null }>(
      `SELECT id, name, display_name, slug, parent_id
         FROM public.taxonomy_nodes
        WHERE tenant_id = $1 AND status = 'published'
        ORDER BY path ASC`,
      [MASTER_TENANT_ID],
    ),
  ])

  const valuesByAttribute = new Map<string, FilterValueShape[]>()
  for (const v of values) {
    const arr = valuesByAttribute.get(v.attribute_id) ?? []
    arr.push({
      id: v.id,
      filter_id: v.attribute_id,
      value: v.value,
      slug: v.slug,
      display_order: v.sort_order ?? 0,
    })
    valuesByAttribute.set(v.attribute_id, arr)
  }

  const mappingCountByAttribute = new Map<string, number>()
  for (const m of mappings) {
    mappingCountByAttribute.set(m.attribute_id, (mappingCountByAttribute.get(m.attribute_id) ?? 0) + 1)
  }

  return { attributes, valuesByAttribute, mappingCountByAttribute, mappings, categories }
}

/** The full editor payload: groups (attributes) + assignments (node_filters) + the published tree. */
export async function loadFiltersEditorData(): Promise<{
  filters: FilterGroupShape[]
  mappings: MappingShape[]
  categories: CategoryShape[]
}> {
  const { attributes, valuesByAttribute, mappingCountByAttribute, mappings, categories } =
    await loadParts()

  return {
    filters: attributes.map((a, i) => groupShape(a, i, valuesByAttribute, mappingCountByAttribute)),
    mappings: mappings.map((m) => ({
      id: m.id,
      filter_id: m.attribute_id,
      category_id: m.node_id,
      display_order: m.sort_order ?? 0,
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.display_name || c.name,
      slug: c.slug,
      parent_id: c.parent_id,
    })),
  }
}

/** One group in editor shape (used by create/update responses). */
export async function getFilterGroup(id: string): Promise<FilterGroupShape | null> {
  const { attributes, valuesByAttribute, mappingCountByAttribute } = await loadParts()
  const idx = attributes.findIndex((a) => a.id === id)
  if (idx < 0) return null
  return groupShape(attributes[idx], idx, valuesByAttribute, mappingCountByAttribute)
}

export async function createFilterGroup(name: string): Promise<FilterGroupShape> {
  const slug = await uniqueSlug(slugify(name), async (candidate) => {
    const rows = await pgQueryStrict(
      `SELECT 1 FROM public.attributes WHERE tenant_id = $1 AND slug = $2 LIMIT 1`,
      [MASTER_TENANT_ID, candidate],
    )
    return rows.length > 0
  })
  const created = await pgQueryStrict<AttributeRow>(
    `INSERT INTO public.attributes (tenant_id, name, slug, data_type)
     VALUES ($1, $2, $3, 'text')
     RETURNING id, name, slug`,
    [MASTER_TENANT_ID, name, slug],
  )
  const group = await getFilterGroup(created[0].id)
  if (!group) throw new Error("Filter group was created but could not be re-read.")
  return group
}

export async function renameFilterGroup(
  id: string,
  patch: { name?: string; slug?: string },
): Promise<FilterGroupShape> {
  const existing = await pgQueryStrict<{ id: string; tenant_id: string }>(
    `SELECT id, tenant_id FROM public.attributes WHERE id = $1 LIMIT 1`,
    [id],
  )
  if (!existing.length) throw new Error("Filter group not found.")

  const sets: string[] = []
  const params: unknown[] = []
  if (typeof patch.name === "string" && patch.name.trim()) {
    params.push(patch.name.trim())
    sets.push(`name = $${params.length}`)
  }
  if (typeof patch.slug === "string" && patch.slug.trim()) {
    const tenantId = existing[0].tenant_id
    const slug = await uniqueSlug(slugify(patch.slug), async (candidate) => {
      const rows = await pgQueryStrict(
        `SELECT 1 FROM public.attributes WHERE tenant_id = $1 AND slug = $2 AND id <> $3 LIMIT 1`,
        [tenantId, candidate, id],
      )
      return rows.length > 0
    })
    params.push(slug)
    sets.push(`slug = $${params.length}`)
  }
  if (sets.length) {
    params.push(id)
    await pgQueryStrict(
      `UPDATE public.attributes SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params,
    )
  }
  const group = await getFilterGroup(id)
  if (!group) throw new Error("Filter group not found after update.")
  return group
}

/**
 * Delete a group and everything the filter system hangs off it:
 * node_filter_values selections → node_filters assignments → values →
 * the attribute itself. If product data still references the attribute
 * (product_attribute_values), the final delete fails on the FK and the
 * error surfaces — the group is genuinely in use and must not vanish.
 */
export async function deleteFilterGroup(id: string): Promise<void> {
  const mappingIds = await pgQueryStrict<{ id: string }>(
    `SELECT id FROM public.node_filters WHERE attribute_id = $1`,
    [id],
  )
  if (mappingIds.length) {
    await pgQueryStrict(
      `DELETE FROM public.node_filter_values WHERE node_filter_id = ANY($1::uuid[])`,
      [mappingIds.map((m) => m.id)],
    )
  }
  await pgQueryStrict(`DELETE FROM public.node_filters WHERE attribute_id = $1`, [id])
  await pgQueryStrict(
    `DELETE FROM public.node_filter_values
      WHERE attribute_value_id IN (SELECT id FROM public.attribute_values WHERE attribute_id = $1)`,
    [id],
  )
  await pgQueryStrict(`DELETE FROM public.attribute_values WHERE attribute_id = $1`, [id])
  const removed = await pgQueryStrict<{ id: string }>(
    `DELETE FROM public.attributes WHERE id = $1 RETURNING id`,
    [id],
  )
  if (!removed.length) throw new Error("Filter group not found.")
}

export async function addFilterValue(
  attributeId: string,
  value: string,
  slugInput?: string,
  displayOrder?: number,
): Promise<FilterValueShape> {
  const attr = await pgQueryStrict(
    `SELECT 1 FROM public.attributes WHERE id = $1 LIMIT 1`,
    [attributeId],
  )
  if (!attr.length) throw new Error("Filter group not found.")

  const slug = await uniqueSlug(slugify(slugInput || value), async (candidate) => {
    const rows = await pgQueryStrict(
      `SELECT 1 FROM public.attribute_values WHERE attribute_id = $1 AND slug = $2 LIMIT 1`,
      [attributeId, candidate],
    )
    return rows.length > 0
  })

  let sortOrder = displayOrder
  if (sortOrder === undefined || Number.isNaN(sortOrder)) {
    const max = await pgQueryStrict<{ max: number | null }>(
      `SELECT MAX(sort_order) AS max FROM public.attribute_values WHERE attribute_id = $1`,
      [attributeId],
    )
    sortOrder = (max[0]?.max ?? 0) + 1
  }

  const created = await pgQueryStrict<ValueRow>(
    `INSERT INTO public.attribute_values (attribute_id, value, slug, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, attribute_id, value, slug, sort_order`,
    [attributeId, value, slug, sortOrder],
  )
  const row = created[0]
  return {
    id: row.id,
    filter_id: row.attribute_id,
    value: row.value,
    slug: row.slug,
    display_order: row.sort_order ?? 0,
  }
}

export async function removeFilterValue(valueId: string): Promise<void> {
  // Drop the filter system's own per-node selections of this value first;
  // product data (product_attribute_values) still blocks the delete on FK.
  await pgQueryStrict(
    `DELETE FROM public.node_filter_values WHERE attribute_value_id = $1`,
    [valueId],
  )
  const removed = await pgQueryStrict<{ id: string }>(
    `DELETE FROM public.attribute_values WHERE id = $1 RETURNING id`,
    [valueId],
  )
  if (!removed.length) throw new Error("Filter value not found.")
}

export async function addMapping(
  attributeId: string,
  nodeId: string,
  displayOrder?: number,
): Promise<MappingShape> {
  const [attr, node] = await Promise.all([
    pgQueryStrict(`SELECT 1 FROM public.attributes WHERE id = $1 LIMIT 1`, [attributeId]),
    pgQueryStrict(`SELECT 1 FROM public.taxonomy_nodes WHERE id = $1 LIMIT 1`, [nodeId]),
  ])
  if (!attr.length) throw new Error("Filter group not found.")
  if (!node.length) throw new Error("Category (taxonomy node) not found.")

  const existing = await pgQueryStrict<MappingRow>(
    `SELECT id, node_id, attribute_id, sort_order FROM public.node_filters
      WHERE attribute_id = $1 AND node_id = $2 LIMIT 1`,
    [attributeId, nodeId],
  )
  if (existing.length) {
    const m = existing[0]
    return { id: m.id, filter_id: m.attribute_id, category_id: m.node_id, display_order: m.sort_order ?? 0 }
  }

  let sortOrder = displayOrder
  if (sortOrder === undefined || Number.isNaN(sortOrder)) {
    const max = await pgQueryStrict<{ max: number | null }>(
      `SELECT MAX(sort_order) AS max FROM public.node_filters WHERE node_id = $1`,
      [nodeId],
    )
    sortOrder = (max[0]?.max ?? 0) + 1
  }

  const created = await pgQueryStrict<MappingRow>(
    `INSERT INTO public.node_filters
       (node_id, attribute_id, sort_order, value_source, display_type, added_by)
     VALUES ($1, $2, $3, 'predefined', 'checkbox', 'admin')
     RETURNING id, node_id, attribute_id, sort_order`,
    [nodeId, attributeId, sortOrder],
  )
  const m = created[0]
  return { id: m.id, filter_id: m.attribute_id, category_id: m.node_id, display_order: m.sort_order ?? 0 }
}

export async function removeMapping(mappingId: string): Promise<void> {
  await pgQueryStrict(
    `DELETE FROM public.node_filter_values WHERE node_filter_id = $1`,
    [mappingId],
  )
  const removed = await pgQueryStrict<{ id: string }>(
    `DELETE FROM public.node_filters WHERE id = $1 RETURNING id`,
    [mappingId],
  )
  if (!removed.length) throw new Error("Mapping not found.")
}
