alter table public.invoices
  add column if not exists snapshot_subtotal_cents integer not null default 0,
  add column if not exists snapshot_tax_cents integer not null default 0,
  add column if not exists snapshot_total_cents integer not null default 0,
  add column if not exists snapshot_summary text;

alter table public.invoices
  drop constraint if exists invoices_job_id_fkey,
  drop constraint if exists invoices_quote_id_fkey;

alter table public.invoices
  add constraint invoices_job_id_fkey
    foreign key (job_id) references public.jobs(id) on delete cascade,
  add constraint invoices_quote_id_fkey
    foreign key (quote_id) references public.quotes(id) on delete restrict;

alter table public.invoices
  alter column job_id set not null,
  alter column quote_id set not null;

create unique index if not exists invoices_job_id_unique
  on public.invoices (job_id);

create index if not exists invoices_workspace_created_at_idx
  on public.invoices (workspace_id, created_at);

create index if not exists invoices_quote_id_idx
  on public.invoices (quote_id);
