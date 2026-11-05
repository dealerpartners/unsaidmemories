-- App-level email confirmation tokens (2026-11-04).
-- The store's own signup confirmation email carries a one-time token
-- link served by the app itself (/api/auth/email/confirm), instead of
-- a Supabase-generated link: admin-generated Supabase links return
-- implicit-flow tokens in a URL fragment, which no server route can
-- read. Only the SHA-256 of each token is stored; service role only.
create table if not exists public.email_confirmation_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null unique,
  next text not null default '/account',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_confirmation_tokens_user_idx
  on public.email_confirmation_tokens (user_id, created_at desc);
alter table public.email_confirmation_tokens enable row level security;
