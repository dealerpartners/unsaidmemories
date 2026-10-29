-- 07-verify-taxonomy.sql — run AFTER 05 + 06 to verify the taxonomy mapping.
-- Expected results are noted per query.

-- 1. New Gelato categories exist under the right parents (expect 6 rows)
select c.name, c.slug, c.level, p.slug as parent_slug
from public.categories c left join public.categories p on p.id = c.parent_id
where c.slug in ('bags','tote-bags','posters','framed-posters','calendars','t-shirts')
order by c.level, c.slug;

-- 2. Gelato base products (expect 925)
select count(*) as gelato_base_products
from public.supplier_catalog_products p
join public.suppliers s on s.id = p.supplier_id
where s.slug = 'gelato' and p.external_id_type = 'gelato_base_product';

-- 3. Gelato variants (expect 17,962 unique; 18,170 attempted, 208 duplicate UIDs in source CSV)
select count(*) as gelato_variants
from public.supplier_catalog_variants v
join public.suppliers s on s.id = v.supplier_id
where s.slug = 'gelato';

-- 4. Orphan variants with no base product (expect 0)
select count(*) as orphan_variants
from public.supplier_catalog_variants v
where not exists (select 1 from public.supplier_catalog_products p where p.id = v.supplier_catalog_product_id);

-- 5. Supplier catalog coverage (expect Printful 558, Gelato 925; all others 0)
select s.name, count(p.id) as catalog_products
from public.suppliers s left join public.supplier_catalog_products p on p.supplier_id = s.id
group by s.name order by catalog_products desc;

-- 6. Spot check: Gelato mug lands under Drinkware, not Apparel (expect ceramic-mugs)
select v.external_id, v.name, v.print_specs->>'category_slug' as category_slug
from public.supplier_catalog_variants v
join public.suppliers s on s.id = v.supplier_id
where s.slug = 'gelato' and v.print_specs->>'gelato_l1' = 'Mugs'
limit 5;

-- 7. Spot check: Gelato apparel/hoodie maps to hoodies, hats to caps/beanies (expect hoodies/caps/beanies)
select v.print_specs->>'gelato_l2' as l2, v.print_specs->>'category_slug' as category_slug, count(*) as n
from public.supplier_catalog_variants v
join public.suppliers s on s.id = v.supplier_id
where s.slug = 'gelato' and v.print_specs->>'gelato_l1' = 'Apparel'
group by 1, 2 order by 2, 1;

-- 8. Spot check: no Gelato variant mapped to a Printful-tree slug (expect 0)
select count(*) as printful_tree_slugs_used
from public.supplier_catalog_variants v
join public.suppliers s on s.id = v.supplier_id
where s.slug = 'gelato' and v.print_specs->>'category_slug' like '%-%'
  and v.print_specs->>'category_slug' ~ '-[0-9]+$';

-- 9. Random 20-variant sanity sample: names, sizes, colors parse (expect non-null size/color on most)
select v.external_id, v.name, v.size, v.color
from public.supplier_catalog_variants v
join public.suppliers s on s.id = v.supplier_id
where s.slug = 'gelato'
order by random() limit 20;
