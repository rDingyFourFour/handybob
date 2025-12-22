alter table public.invoices
  add column if not exists currency text not null default 'USD',
  add column if not exists labor_total_cents integer not null default 0,
  add column if not exists materials_total_cents integer not null default 0,
  add column if not exists trip_fee_cents integer not null default 0,
  add column if not exists tax_total_cents integer not null default 0,
  add column if not exists total_cents integer not null default 0,
  add column if not exists job_title_snapshot text not null default '',
  add column if not exists customer_name_snapshot text not null default '',
  add column if not exists customer_phone_snapshot text,
  add column if not exists notes_snapshot text;

create unique index if not exists invoices_workspace_job_unique
  on public.invoices (workspace_id, job_id);

create index if not exists invoices_workspace_created_at_idx
  on public.invoices (workspace_id, created_at desc);
