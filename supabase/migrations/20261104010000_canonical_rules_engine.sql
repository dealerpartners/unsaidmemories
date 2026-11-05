-- ============================================================
-- Canonical product rules engine — step 1 (owner brief, 2026-11-03)
--
-- The catalog stops being a flat dump. canonical_products is the
-- one record designed against (the studio's product stage and the
-- accounting catalog already read it as the normalized taxonomy);
-- this migration gives it the brief's shape and the rules engine:
-- status split into lifecycle / visibility / season, season set on
-- the child category, saved-view work queues, rule collections on
-- the JOINT collections table (built in admin, published to the
-- front), bulk actions with dry runs and undo, season sync.
--
-- Source design: ~/workspace/user/files/rules_engine.sql, adapted
-- only where the live schema differs (noted inline). Nothing in
-- here changes storefront behavior on the day it lands: canonical
-- rows default to lifecycle=imported / visibility=hidden, seasons
-- default to year_round until child categories are tagged.
-- ============================================================

-- 1. Enums -------------------------------------------------------
do $$ begin
  create type product_lifecycle as enum ('imported','categorized','designed','ready','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_visibility as enum ('hidden','published');
exception when duplicate_object then null; end $$;

-- 2. Columns -----------------------------------------------------
alter table categories
  add column if not exists default_seasons text[] not null default '{year_round}';

-- canonical_products exists as the normalized taxonomy (id,
-- sku_slug, name, category text). Extend it into the brief's shape;
-- the columns the studio/accounting already read stay untouched.
alter table canonical_products
  add column if not exists title           text,
  add column if not exists brand           text,
  add column if not exists child_id        uuid references categories(id),
  add column if not exists lifecycle       product_lifecycle  not null default 'imported',
  add column if not exists visibility      product_visibility not null default 'hidden',
  add column if not exists season_override text[],
  add column if not exists season_auto     boolean            not null default true,
  add column if not exists has_design      boolean            not null default false,
  add column if not exists last_sale_at    timestamptz;

update canonical_products set title = name where title is null;

-- Best-effort child link from the legacy category text; whatever
-- does not match lands in the "Needs category" queue, which is
-- what the queue is for.
update canonical_products p
   set child_id = c.id
  from categories c
 where p.child_id is null
   and (c.slug = lower(regexp_replace(p.category, '\s+', '-', 'g'))
        or c.name = p.category);

create index if not exists cp_state_idx on canonical_products (lifecycle, visibility);
create index if not exists cp_child_idx on canonical_products (child_id);

-- Provider offers underneath the canonical product (brief's
-- minimal shape). The offer is picked at order time — cheapest,
-- nearest, in stock — never baked into the product.
create table if not exists provider_offers (
  id           uuid primary key default gen_random_uuid(),
  canonical_id uuid not null references canonical_products(id),
  provider     text not null,
  cost         numeric(10,2),
  location     text,
  created_at   timestamptz not null default now()
);
create index if not exists po_canonical_idx on provider_offers (canonical_id);

-- 3. Season windows (selling windows, with lead time; edit freely)
create table if not exists season_windows (
  season      text primary key,
  start_month int not null, start_day int not null,
  end_month   int not null, end_day   int not null
);

insert into season_windows values
  ('spring', 2, 1, 5, 31),
  ('summer', 5, 1, 8, 31),
  ('fall',   8, 15, 11, 30),
  ('winter', 10, 15, 2, 28)   -- wraps the year end
on conflict (season) do nothing;

create or replace function in_season(seasons text[], d date default current_date)
returns boolean language sql stable as $$
  select 'year_round' = any(seasons)
      or exists (
        select 1 from season_windows w
        where w.season = any(seasons)
          and case
            when w.start_month*100+w.start_day <= w.end_month*100+w.end_day
              then extract(month from d)*100+extract(day from d)
                   between w.start_month*100+w.start_day and w.end_month*100+w.end_day
            else extract(month from d)*100+extract(day from d) >= w.start_month*100+w.start_day
              or extract(month from d)*100+extract(day from d) <= w.end_month*100+w.end_day
          end
      );
$$;

-- 4. Facts view: the only surface rules can query ------------------
create or replace view product_facts as
select
  p.id, p.title, p.brand, p.child_id, c.parent_id,
  p.lifecycle, p.visibility,
  coalesce(p.season_override, c.default_seasons, '{year_round}') as seasons,
  in_season(coalesce(p.season_override, c.default_seasons, '{year_round}')) as in_season,
  p.season_auto, p.has_design,
  coalesce(extract(day from now() - p.last_sale_at), 9999)::int as days_since_sale
from canonical_products p
left join categories c on c.id = p.child_id;

-- 5. Rule compiler: JSON -> safe WHERE clause ----------------------
create or replace function rule_where(r jsonb) returns text
language plpgsql stable as $$
declare
  allowed text[] := array['id','brand','child_id','parent_id','lifecycle','visibility',
                          'seasons','in_season','season_auto','has_design','days_since_sale'];
  f text; op text; v jsonb; frag text; arr text[];
begin
  if r is null or r = '{}'::jsonb then return 'true'; end if;

  if r ? 'all' then
    select coalesce(string_agg(rule_where(e), ' and '), 'true') into frag
      from jsonb_array_elements(r->'all') e;
    return '(' || frag || ')';
  elsif r ? 'any' then
    select coalesce(string_agg(rule_where(e), ' or '), 'false') into frag
      from jsonb_array_elements(r->'any') e;
    return '(' || frag || ')';
  elsif r ? 'not' then
    return '(not ' || rule_where(r->'not') || ')';
  elsif r ? 'collection' then
    return format('id in (select collection_ids(%L::uuid))', r->>'collection');
  end if;

  f := r->>'field'; op := r->>'op'; v := r->'value';
  if f is null or not (f = any(allowed)) then
    raise exception 'rule: field "%" is not allowed', f;
  end if;

  if v is not null and jsonb_typeof(v) = 'array' then
    select array_agg(x) into arr from jsonb_array_elements_text(v) x;
  end if;

  if    op = 'eq'       then return format('%I = %L', f, v #>> '{}');
  elsif op = 'neq'      then return format('%I is distinct from %L', f, v #>> '{}');
  elsif op = 'in'       then return format('%I::text = any(%L::text[])', f, arr);
  elsif op = 'nin'      then return format('not (%I::text = any(%L::text[]))', f, arr);
  elsif op = 'overlaps' then return format('%I && %L::text[]', f, arr);
  elsif op = 'gte'      then return format('%I >= %L', f, v #>> '{}');
  elsif op = 'lte'      then return format('%I <= %L', f, v #>> '{}');
  elsif op = 'is_null'  then return format('%I is null', f);
  else raise exception 'rule: op "%" is not supported', op;
  end if;
end $$;

-- 6. Preview: count + sample, no writes ----------------------------
create or replace function preview_rule(r jsonb, sample_n int default 12)
returns jsonb language plpgsql stable as $$
declare w text := rule_where(r); n int; s jsonb;
begin
  execute format('select count(*) from product_facts where %s', w) into n;
  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from
       (select id, title, brand, lifecycle, visibility from product_facts where %s limit %s) t',
    w, sample_n) into s;
  return jsonb_build_object('count', n, 'sample', s);
end $$;

-- 7. Collections: the JOINT table ----------------------------------
-- One collections table, shared: a collection is built in the
-- admin (rule + pins + excludes) and published to the front. The
-- rule columns land on the existing table; rows the storefront
-- already carries keep rule = null, which collection_ids treats
-- as "not a rule collection" (pins only), never as "match all".
alter table collections
  add column if not exists rule     jsonb,
  add column if not exists pinned   uuid[] not null default '{}',
  add column if not exists excluded uuid[] not null default '{}';

create or replace function collection_ids(cid uuid) returns setof uuid
language plpgsql stable as $$
declare c collections%rowtype;
begin
  select * into c from collections where id = cid;
  if not found then return; end if;
  if c.rule is null then
    return query select id from canonical_products
      where id = any(c.pinned) and not (id = any(c.excluded));
    return;
  end if;
  return query execute format(
    'select id from product_facts
      where (%s or id = any(%L::uuid[])) and not (id = any(%L::uuid[]))',
    rule_where(c.rule), c.pinned, c.excluded);
end $$;

-- 8. Bulk actions with dry run + undo ------------------------------
create table if not exists bulk_jobs (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor      text,
  action     text not null,
  rule       jsonb,
  params     jsonb,
  affected   int not null default 0,
  undo       jsonb,
  undone_at  timestamptz
);

create or replace function apply_bulk(
  r jsonb, action text, params jsonb default '{}', dry_run boolean default true,
  actor text default 'admin'
) returns jsonb language plpgsql as $$
declare w text; ids uuid[]; n int; undo jsonb; job uuid; lock_it boolean;
begin
  w := rule_where(r);
  if action = 'publish' then w := w || ' and lifecycle = ''ready'''; end if; -- guard
  execute format('select coalesce(array_agg(id), ''{}'') from product_facts where %s', w) into ids;
  n := coalesce(array_length(ids, 1), 0);

  if dry_run or n = 0 then
    return jsonb_build_object('dry_run', dry_run, 'action', action, 'would_affect', n);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'visibility', visibility, 'lifecycle', lifecycle,
      'season_override', season_override, 'child_id', child_id, 'season_auto', season_auto)),
    '[]'::jsonb)
  into undo from canonical_products where id = any(ids);

  lock_it := coalesce((params->>'lock')::boolean, false);

  if action = 'publish' then
    update canonical_products set visibility = 'published',
      season_auto = case when lock_it then false else season_auto end
      where id = any(ids);
  elsif action = 'hide' then
    update canonical_products set visibility = 'hidden',
      season_auto = case when lock_it then false else season_auto end
      where id = any(ids);
  elsif action = 'set_season' then
    update canonical_products set season_override =
      case when jsonb_array_length(coalesce(params->'seasons','[]')) = 0 then null
           else array(select jsonb_array_elements_text(params->'seasons')) end
      where id = any(ids);
  elsif action = 'move_child' then
    update canonical_products set child_id = (params->>'child_id')::uuid,
      lifecycle = case when lifecycle = 'imported' then 'categorized' else lifecycle end
      where id = any(ids);
  elsif action = 'set_lifecycle' then
    update canonical_products set lifecycle = (params->>'lifecycle')::product_lifecycle
      where id = any(ids);
  else
    raise exception 'unknown action %', action;
  end if;

  insert into bulk_jobs(actor, action, rule, params, affected, undo)
  values (actor, action, r, params, n, undo) returning id into job;

  return jsonb_build_object('dry_run', false, 'action', action, 'affected', n, 'job_id', job);
end $$;

create or replace function undo_bulk(job uuid) returns jsonb
language plpgsql as $$
declare j bulk_jobs%rowtype;
begin
  select * into j from bulk_jobs where id = job and undone_at is null;
  if not found then raise exception 'job not found or already undone'; end if;

  update canonical_products p set
    visibility  = (u->>'visibility')::product_visibility,
    lifecycle   = (u->>'lifecycle')::product_lifecycle,
    child_id    = nullif(u->>'child_id','')::uuid,
    season_auto = (u->>'season_auto')::boolean,
    season_override = case when jsonb_typeof(u->'season_override') = 'array'
                      then array(select jsonb_array_elements_text(u->'season_override'))
                      else null end
  from jsonb_array_elements(j.undo) u
  where p.id = (u->>'id')::uuid;

  update bulk_jobs set undone_at = now() where id = job;
  return jsonb_build_object('restored', j.affected);
end $$;

-- 9. Season sync (run nightly) -------------------------------------
create or replace function sync_seasonal_visibility(dry_run boolean default true)
returns jsonb language plpgsql as $$
declare to_pub int; to_hide int;
begin
  select count(*) into to_pub from product_facts
    where in_season and season_auto and lifecycle = 'ready' and visibility = 'hidden';
  select count(*) into to_hide from product_facts
    where not in_season and season_auto and visibility = 'published';

  if not dry_run then
    update canonical_products p set visibility = 'published'
      from product_facts f where f.id = p.id
      and f.in_season and f.season_auto and f.lifecycle = 'ready' and f.visibility = 'hidden';
    update canonical_products p set visibility = 'hidden'
      from product_facts f where f.id = p.id
      and not f.in_season and f.season_auto and f.visibility = 'published';
    insert into bulk_jobs(actor, action, affected, params)
      values ('cron', 'season_sync', to_pub + to_hide,
              jsonb_build_object('published', to_pub, 'hidden', to_hide));
  end if;

  return jsonb_build_object('dry_run', dry_run, 'publish', to_pub, 'hide', to_hide);
end $$;

-- Schedule with pg_cron only after a reviewed dry run:
-- select cron.schedule('season-sync', '0 3 * * *', $$select sync_seasonal_visibility(false)$$);

-- 10. Work queues (saved views with live counts) -------------------
create table if not exists saved_views (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  rule     jsonb not null,
  sort     int not null default 0,
  is_queue boolean not null default true
);

insert into saved_views (name, sort, rule) values
  ('Needs category',            1, '{"field":"lifecycle","op":"eq","value":"imported"}'),
  ('Categorized, needs design', 2, '{"field":"lifecycle","op":"eq","value":"categorized"}'),
  ('Designed, not ready',       3, '{"field":"lifecycle","op":"eq","value":"designed"}'),
  ('Ready, hidden, in season',  4, '{"all":[{"field":"lifecycle","op":"eq","value":"ready"},{"field":"visibility","op":"eq","value":"hidden"},{"field":"in_season","op":"eq","value":true}]}'),
  ('Live, out of season',       5, '{"all":[{"field":"visibility","op":"eq","value":"published"},{"field":"in_season","op":"eq","value":false}]}'),
  ('Live, no sales in 90 days', 6, '{"all":[{"field":"visibility","op":"eq","value":"published"},{"field":"days_since_sale","op":"gte","value":90}]}')
on conflict (name) do nothing;

create or replace function queue_counts() returns table(id uuid, name text, n int)
language plpgsql stable as $$
declare v saved_views%rowtype;
begin
  for v in select * from saved_views where is_queue order by sort loop
    id := v.id; name := v.name;
    execute format('select count(*) from product_facts where %s', rule_where(v.rule)) into n;
    return next;
  end loop;
end $$;

-- 11. New tables: service-role only --------------------------------
alter table provider_offers enable row level security;
alter table bulk_jobs       enable row level security;
alter table saved_views     enable row level security;
alter table season_windows  enable row level security;

-- 12. Lock it down: admin/service role only ------------------------
revoke all on function apply_bulk, undo_bulk, sync_seasonal_visibility,
  preview_rule, queue_counts, collection_ids from public, anon, authenticated;
