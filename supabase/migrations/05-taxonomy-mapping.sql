-- 05-taxonomy-mapping.sql — Gelato taxonomy mapping, generated 2026-10-29
-- Run AFTER 02-seed-taxonomy.sql (+ 03/04). Adds the physical-product-type
-- categories the Gelato catalog needs under the canonical blueprint tree
-- (tenant NULL = platform-shared, same pattern as 02/03 seeds).
-- Gelato L1 -> category slug mapping (verified against 18,170 variant UIDs):
--   Cards -> celebrations/gift-packaging/cards (exists)
--   Posters -> home-and-living/decor/posters (NEW)
--   Framed Posters -> home-and-living/decor/framed-posters (NEW)
--   Calendars -> office/desk-gifts/calendars (NEW)
--   Mugs -> drinkware/mugs/ceramic-mugs (exists; Gelato mugs are porcelain/ceramic)
--   T Shirts -> apparel/tops/t-shirts (NEW)
--   Notebooks -> office/desk-gifts/notebooks (exists)
--   Tote Bags -> accessories/bags/tote-bags (NEW L2 + L3)
--   Apparel/hats -> accessories/headwear/caps|beanies (exists, split by L2)
--   Apparel/hoodies -> apparel/outerwear/hoodies (exists)
-- Categories are physical product types only (Kim's binding rule); brands and
-- collections stay flat and are NOT touched here.
insert into public.categories (tenant_id, parent_id, level, name, slug, description, sort_order) values (NULL, (select id from public.categories where slug='accessories' and tenant_id is null), 2, 'Bags', 'bags', 'Gelato catalog import 2026-10-29', 16) on conflict (slug, tenant_id) do nothing;
insert into public.categories (tenant_id, parent_id, level, name, slug, description, sort_order) values (NULL, (select id from public.categories where slug='bags' and tenant_id is null), 3, 'Tote bags', 'tote-bags', 'Gelato catalog import 2026-10-29', 35) on conflict (slug, tenant_id) do nothing;
insert into public.categories (tenant_id, parent_id, level, name, slug, description, sort_order) values (NULL, (select id from public.categories where slug='decor' and tenant_id is null), 3, 'Posters', 'posters', 'Gelato catalog import 2026-10-29', 36) on conflict (slug, tenant_id) do nothing;
insert into public.categories (tenant_id, parent_id, level, name, slug, description, sort_order) values (NULL, (select id from public.categories where slug='decor' and tenant_id is null), 3, 'Framed posters', 'framed-posters', 'Gelato catalog import 2026-10-29', 37) on conflict (slug, tenant_id) do nothing;
insert into public.categories (tenant_id, parent_id, level, name, slug, description, sort_order) values (NULL, (select id from public.categories where slug='desk-gifts' and tenant_id is null), 3, 'Calendars', 'calendars', 'Gelato catalog import 2026-10-29', 38) on conflict (slug, tenant_id) do nothing;
insert into public.categories (tenant_id, parent_id, level, name, slug, description, sort_order) values (NULL, (select id from public.categories where slug='tops' and tenant_id is null), 3, 'T-shirts', 't-shirts', 'Gelato catalog import 2026-10-29', 39) on conflict (slug, tenant_id) do nothing;
-- new category rows: 6
