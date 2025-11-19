alter table public.invoices
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists line_items jsonb,
  add column if not exists subtotal numeric not null default 0,
  add column if not exists tax numeric not null default 0;

update public.invoices
set subtotal = coalesce(subtotal, total, 0),
    tax = coalesce(tax, 0)
where true;

create index if not exists invoices_job_id_idx
  on public.invoices (job_id);
