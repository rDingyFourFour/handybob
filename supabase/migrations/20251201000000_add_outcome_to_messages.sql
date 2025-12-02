alter table if exists public.messages
  add column if not exists outcome text;
