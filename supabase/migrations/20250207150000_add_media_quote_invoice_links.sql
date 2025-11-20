-- Add optional linkage from media to quotes/invoices
alter table public.media
  add column if not exists quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

create index if not exists media_quote_id_idx on public.media (quote_id);
create index if not exists media_invoice_id_idx on public.media (invoice_id);
