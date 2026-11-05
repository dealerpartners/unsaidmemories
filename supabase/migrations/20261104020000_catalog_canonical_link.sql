-- ============================================================
-- Catalog -> canonical link (owner brief, 2026-11-04)
--
-- The variants table and its parent catalog products gain the
-- canonical link the rules engine runs on. Until now the studio
-- layer (print specs, costs) knew the canonical product while the
-- storefront catalog rows carried no link at all — the same
-- product from different suppliers could not be recognised as one
-- product anywhere the customer shops.
--
-- Backfill is conservative and auditable: a catalog product links
-- to a canonical blank only when the brand agrees AND the model
-- token matches on a word boundary (so Bella+Canvas 6400 never
-- swallows Gildan 64000), or — for the mugs, which carry no model
-- token — the normalised name is exactly the canonical name.
-- Everything unmatched stays null for the merge step, which is
-- where the full collapse belongs.
-- ============================================================

alter table supplier_catalog_products
  add column if not exists canonical_product_id uuid references canonical_products(id);
create index if not exists scp_canonical_idx on supplier_catalog_products (canonical_product_id);

alter table supplier_catalog_variants
  add column if not exists canonical_product_id uuid references canonical_products(id);
create index if not exists scv_canonical_idx on supplier_catalog_variants (canonical_product_id);

-- Normalised comparison helper (inline in each rule): lower,
-- punctuation stripped, so "Bella + Canvas" and "Bella+Canvas"
-- compare equal.

-- Apparel: brand + model token on a word boundary.
with rules(canonical_name, brand, token) as (
  values
    ('Bella + Canvas 3001 Unisex Staple Tee', 'bellacanvas', '3001'),
    ('Unisex Long Sleeve Tee | Bella + Canvas 3501', 'bellacanvas', '3501'),
    ('Women''s Relaxed T-Shirt | Bella + Canvas 6400', 'bellacanvas', '6400'),
    ('Gildan 64000 Softstyle Tee', 'gildan', '64000'),
    ('Unisex Classic Tee | Gildan 5000', 'gildan', '5000'),
    ('Unisex Crew Neck Sweatshirt | Gildan 18000', 'gildan', '18000'),
    ('Unisex Heavy Blend Hoodie | Gildan 18500', 'gildan', '18500'),
    ('Unisex Garment-Dyed Heavyweight T-Shirt | Comfort Colors 1717', 'comfortcolors', '1717')
)
update supplier_catalog_products p
   set canonical_product_id = cp.id
  from rules r
  join canonical_products cp on cp.name = r.canonical_name
 where p.canonical_product_id is null
   and replace(replace(lower(coalesce(p.brand_name,'') || ' ' || p.name), ' ', ''), '+', '')
       like '%' || r.brand || '%'
   and p.name ~ ('\m' || r.token || '\M');

-- Mugs: exact normalised name.
update supplier_catalog_products p
   set canonical_product_id = cp.id
  from canonical_products cp
 where p.canonical_product_id is null
   and cp.name in ('Black Glossy Mug','Enamel Mug','White Glossy Mug','White Ceramic Mug with Color Inside')
   and lower(regexp_replace(p.name, '[^a-z0-9]+', ' ', 'g'))
       = lower(regexp_replace(cp.name, '[^a-z0-9]+', ' ', 'g'));

-- Variants inherit their product's canonical link.
update supplier_catalog_variants v
   set canonical_product_id = p.canonical_product_id
  from supplier_catalog_products p
 where v.supplier_catalog_product_id = p.id
   and v.canonical_product_id is null
   and p.canonical_product_id is not null;
