-- Preserve the original supplier image references before the catalog
-- image pipeline replaces them with our own stored copies.
alter table supplier_catalog_products
  add column if not exists image_url_original text,
  add column if not exists images_original jsonb,
  add column if not exists images_processed_at timestamptz;
