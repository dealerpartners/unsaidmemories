-- POD render queue (Sunny's play, slice 2)
-- Render queue fields: a renders row starts as a request (queued) and the
-- worker fills input_hash + storage_path when it executes the plan.
alter table public.renders alter column input_hash drop not null;
alter table public.renders add column if not exists design_ref text;
alter table public.renders add column if not exists color_hex text;
alter table public.renders add column if not exists placement jsonb;
alter table public.renders add column if not exists purpose text not null default 'publish';
alter table public.renders add column if not exists error text;
