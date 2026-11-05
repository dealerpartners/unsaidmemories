-- design_publications.id had no default: every app insert without an
-- explicit id failed on the not-null constraint (found 2026-11-04 when
-- the publish route counted 58 written rows that never landed).
alter table public.design_publications
  alter column id set default gen_random_uuid();
