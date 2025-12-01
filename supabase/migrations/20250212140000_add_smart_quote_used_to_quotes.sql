alter table public.quotes
  add column if not exists smart_quote_used boolean not null default false;
