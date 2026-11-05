-- POD publish: render_ready guard on apply_bulk + generate_products (Sunny's play, slice 3)

CREATE OR REPLACE FUNCTION public.apply_bulk(r jsonb, action text, params jsonb DEFAULT '{}'::jsonb, dry_run boolean DEFAULT true, actor text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare w text; ids uuid[]; n int; undo jsonb; job uuid; lock_it boolean;
begin
  w := rule_where(r);
  if action = 'publish' then w := w || ' and lifecycle = ''ready'' and render_ready'; end if; -- guard: lifecycle ready AND render-ready (POD play)
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
end $function$
;

alter table public.renders add column if not exists batch_id uuid;

create or replace function public.generate_products(
  p_rule jsonb, p_design_id uuid, p_colors jsonb default '[]'::jsonb,
  p_dry_run boolean default true, p_actor text default 'admin')
returns jsonb language plpgsql as $fn$
declare
  w text; blank_ids uuid[]; n_blanks int; n_renders int; job uuid; dref text;
  color_list jsonb := case when p_colors is null or p_colors = '[]'::jsonb
                           then '[{"color":"White","hex":"#ffffff"}]'::jsonb else p_colors end;
begin
  w := rule_where(p_rule);
  execute format('select coalesce(array_agg(id), ''{}'') from product_facts where %s and render_ready', w) into blank_ids;
  n_blanks := coalesce(array_length(blank_ids, 1), 0);

  select count(*) into n_renders
    from (select distinct a.blank_id, a.view from blank_assets a
           where a.blank_id = any(blank_ids) and a.kind = 'shading'
             and a.box_w_in is not null and a.view in ('front','back')) v
    cross join jsonb_array_elements(color_list);

  if p_dry_run or n_blanks = 0 then
    return jsonb_build_object('dry_run', p_dry_run, 'action', 'generate_products',
                              'blanks', n_blanks, 'would_render', coalesce(n_renders, 0));
  end if;

  select file_url into dref from design_files
   where design_files.design_id = p_design_id and placement = 'front'
   order by version desc limit 1;
  if dref is null then raise exception 'design % has no front print file', p_design_id; end if;

  insert into bulk_jobs (actor, action, rule, params, affected)
  values (p_actor, 'generate_products', p_rule,
          jsonb_build_object('design_id', p_design_id, 'colors', color_list), coalesce(n_renders, 0))
  returning id into job;

  insert into renders (design_id, blank_id, view, color, color_hex, design_ref, purpose, status, batch_id)
  select p_design_id, v.blank_id, v.view, c->>'color', c->>'hex', dref, 'publish', 'queued', job
    from (select distinct a.blank_id, a.view from blank_assets a
           where a.blank_id = any(blank_ids) and a.kind = 'shading'
             and a.box_w_in is not null and a.view in ('front','back')) v
    cross join jsonb_array_elements(color_list) c;

  return jsonb_build_object('dry_run', false, 'action', 'generate_products',
                            'blanks', n_blanks, 'queued', coalesce(n_renders, 0), 'job', job);
end $fn$;

revoke execute on function public.generate_products(jsonb, uuid, jsonb, boolean, text) from public, anon, authenticated;

create or replace function public.undo_generate_products(p_job uuid)
returns jsonb language plpgsql as $fn$
declare n int;
begin
  delete from renders where batch_id = p_job and status = 'queued';
  get diagnostics n = row_count;
  update bulk_jobs set undone_at = now() where id = p_job and undone_at is null;
  return jsonb_build_object('removed_queued', n);
end $fn$;

revoke execute on function public.undo_generate_products(uuid) from public, anon, authenticated;
