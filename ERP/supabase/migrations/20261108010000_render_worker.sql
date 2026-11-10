-- Render worker support (PoD sprint, Nov 8 2026).
-- Additive only. The worker claims queued design_renders rows with
-- FOR UPDATE SKIP LOCKED, renders them, and writes storage_path.
-- Stuck rows (>5 min in 'running') are requeued while attempts remain;
-- exhausted rows (>3 attempts) are marked failed, never silently dropped.
alter table public.design_renders
  add column if not exists attempts int not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists last_error text;

create index if not exists design_renders_running_idx
  on public.design_renders (updated_at) where status = 'running';

create or replace function public.claim_design_renders(batch_size int default 5)
returns setof public.design_renders
language plpgsql
security definer
as $$
begin
  -- Requeue stuck rows with attempts left.
  update public.design_renders
     set status = 'queued', claimed_at = null, updated_at = now()
   where status = 'running'
     and updated_at < now() - interval '5 minutes'
     and attempts < 3;
  -- Fail stuck rows that exhausted their attempts.
  update public.design_renders
     set status = 'failed',
         last_error = 'Render stuck in running for over 5 minutes after 3 attempts.',
         updated_at = now()
   where status = 'running'
     and updated_at < now() - interval '5 minutes'
     and attempts >= 3;
  -- Claim the oldest queued rows, skipping rows locked by another worker.
  return query
  update public.design_renders r
     set status = 'running',
         claimed_at = now(),
         attempts = r.attempts + 1,
         updated_at = now()
   where r.id in (
     select id
       from public.design_renders
      where status = 'queued'
      order by created_at asc
      limit batch_size
        for update skip locked
   )
   returning r.*;
end;
$$;
