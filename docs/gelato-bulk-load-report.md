# Gelato bulk load report — 2026-10-29

## Source
`taxonomy-full-combined.csv` — 18,170 Gelato rows, all `item_type=product_variant`,
keyed by Gelato `productUid` (`supplier_id` column in the CSV).

## Dedupe finding (important)
The 18,170 CSV rows contain **208 cross-catalog duplicates**: the same productUid
appears under two Gelato catalogs (e.g. `cards_pf_5r_..._hor` listed under both
"Cards" and "Posters"). `unique(supplier_id, external_id)` enforces one row per
UID, so **17,962 unique UIDs** were loaded. First CSV occurrence wins.

## What was loaded (verified by CLI count queries)
| Table | Before | After | Notes |
|---|---|---|---|
| supplier_catalog_products (Gelato) | 0 | **18,887** | 17,962 `gelato_product_uid` (this load) + 925 `gelato_product_family` (parallel ingestion agent's base-family rows, e.g. `gelato:Cards / A6 / 115-gsm-uncoated`) |
| supplier_catalog_variants (Gelato) | 0 | **17,962** | one per UID, FK-linked to its product row |
| categories (Gelato, platform-shared) | 0 | **977** | 9 L1 + L2/L3 attribute levels, slugs `gelato-*`, tenant NULL |

## Verification (all via `supabase db query --linked`)
- 25/25 part files applied, 0 failures.
- Orphan variants (variant with no product): **0**.
- 20/20 random variant spot-checks: product name matches `print_specs.gelato_catalog`
  (e.g. "T Shirts t-shirt / crewneck kids / L" ↔ catalog "T Shirts"). 0 issues.
- Category tree: 9 L1 slugs (`gelato-cards`, `gelato-posters`, `gelato-framed-posters`,
  `gelato-t-shirts`, `gelato-apparel`, `gelato-notebooks`, `gelato-calendars`,
  `gelato-tote-bags`, `gelato-mugs`), parents before children.

## Category mapping model
`supplier_catalog_products` has no category FK by design. Mapping is carried by:
1. `categories` rows (this load, `gelato-*` slugs, levels 1–3 from CSV L1/L2/L3),
2. `print_specs` jsonb on each variant: `{gelato_catalog, l2, l3}`,
3. `taxonomy-full-combined.csv` (L1/L2/L3/L4 per UID).
The parallel taxonomy-mapper agent owns any further product→category linkage.

## Files
- `06-gelato-bulk-load.sql` — manifest / apply order
- `06-gelato-categories.sql` — 977 category rows (idempotent)
- `06-gelato-products-01..12.sql` — 17,962 products, 250 rows/statement, on-conflict do nothing
- `06-gelato-variants-01..12.sql` — 17,962 variants, 250 rows/statement, on-conflict do nothing
- `06-gelato-parts/` — original 250-row part files (kept, redundant)
- `06-gelato-catalog.sql` — NOT mine; parallel ingestion agent's file, do not apply twice
  (its 925 family rows are already in the DB; all inserts are on-conflict-do-nothing so
  re-running anything is safe).

## Notes / limits
- `size`/`color` on variants left NULL: Gelato UIDs encode attributes inconsistently
  per catalog; parsing them would invent data. Full attributes are in `print_specs`.
- `brand_name` = 'Gelato' on all product rows (manufacturer).
- Nothing was deleted. The 32 static routes were not touched. No push performed.
