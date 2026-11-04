-- Optional: the server creates this automatically on first start.
-- Run it yourself in Supabase → SQL editor if you prefer to create it up front.
create schema if not exists hub;
create table if not exists hub.kv (
  key        text primary key,          -- e.g. users/<id>/state, email/<sha256>, users/<id>/snapshots/2026-11-03
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table hub.kv enable row level security;  -- no policies: Supabase's public API can't read or write it
revoke all on schema hub from public;
