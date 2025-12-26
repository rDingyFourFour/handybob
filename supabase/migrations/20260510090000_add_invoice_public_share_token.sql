alter table public.invoices
  add column if not exists invoice_public_token text,
  add column if not exists invoice_public_token_created_at timestamptz;

create unique index if not exists invoices_invoice_public_token_idx
  on public.invoices (invoice_public_token);
