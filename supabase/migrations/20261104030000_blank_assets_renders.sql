-- POD rendering engine: blank assets, renders, render_ready gate (Sunny's play, 2026-11-04)
-- blank_assets carries the play's schema plus the print-area box in inches
-- (box_*_in) on the asset row for its view, so buildStage reads photo, box
-- and pixels-per-inch from one place.

alter table public.canonical_products
  add column if not exists render_ready boolean not null default false;

create table if not exists public.blank_assets (
  id uuid primary key default gen_random_uuid(),
  blank_id uuid not null references public.canonical_products(id),
  view text not null,
  color text,
  kind text not null check (kind in ('base','shading','mask','model')),
  source text not null,
  source_url text,
  storage_path text,
  sha256 text,
  width integer,
  height integer,
  px_per_inch numeric,
  box_x_in numeric,
  box_y_in numeric,
  box_w_in numeric,
  box_h_in numeric,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists blank_assets_blank_idx on public.blank_assets (blank_id, view, kind);
alter table public.blank_assets enable row level security;

create table if not exists public.renders (
  id uuid primary key default gen_random_uuid(),
  design_id uuid,
  blank_id uuid not null references public.canonical_products(id),
  view text not null,
  color text,
  input_hash text not null,
  storage_path text,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);
create index if not exists renders_input_idx on public.renders (input_hash);
alter table public.renders enable row level security;

create or replace view public.product_facts as
 SELECT p.id,
    p.title,
    p.brand,
    p.child_id,
    c.parent_id,
    p.lifecycle,
    p.visibility,
    COALESCE(p.season_override, c.default_seasons, '{year_round}'::text[]) AS seasons,
    in_season(COALESCE(p.season_override, c.default_seasons, '{year_round}'::text[])) AS in_season,
    p.season_auto,
    p.has_design,
    (COALESCE(EXTRACT(day FROM (now() - p.last_sale_at)), (9999)::numeric))::integer AS days_since_sale,
    p.render_ready
   FROM (canonical_products p
     LEFT JOIN categories c ON ((c.id = p.child_id)));

CREATE OR REPLACE FUNCTION public.rule_where(r jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  allowed text[] := array['id','brand','child_id','parent_id','lifecycle','visibility',
                          'seasons','in_season','season_auto','has_design','days_since_sale','render_ready'];
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
end $function$
;
