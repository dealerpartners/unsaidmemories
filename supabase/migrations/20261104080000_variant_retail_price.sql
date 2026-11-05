-- retail_price on supplier variants (owner-approved 2026-11-04): the
-- reprice writes (cost + exact US Standard shipping) / (1 - margin)
-- here, leaving price_snapshot (cost) untouched.
alter table public.supplier_catalog_variants
  add column if not exists retail_price numeric;
