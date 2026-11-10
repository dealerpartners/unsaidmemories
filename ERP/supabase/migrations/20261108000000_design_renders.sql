-- design_renders: the ONE new table for the POD designer (contracts v1 §5).
-- A queued render job per (design, view, color, kind). The worker claims
-- queued rows with FOR UPDATE SKIP LOCKED, renders, and writes storage_path.
-- Apply: Supabase dashboard SQL editor, or `supabase db push`.
create table if not exists public.design_renders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  design_id uuid not null,
  canonical_product_id uuid,
  view_angle text not null,
  color text not null default 'default',
  kind text not null check (kind in ('mockup', 'print')),
  input_hash text not null,
  renderer_version text not null default '1.0.0',
  storage_path text,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'stale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists design_renders_tenant_hash_kind_view_color_uidx
  on public.design_renders (tenant_id, input_hash, kind, view_angle, color);

create index if not exists design_renders_queue_idx
  on public.design_renders (status, created_at) where status = 'queued';

create index if not exists design_renders_design_idx
  on public.design_renders (design_id, created_at desc);
