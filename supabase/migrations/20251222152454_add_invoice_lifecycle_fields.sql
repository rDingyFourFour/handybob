alter table public.invoices
  add column if not exists invoice_status text,
  add column if not exists sent_at timestamptz,
  add column if not exists voided_at timestamptz;

update public.invoices
set invoice_status = 'draft'
where invoice_status is null;

alter table public.invoices
  alter column invoice_status set default 'draft',
  alter column invoice_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_invoice_status_check'
  ) then
    alter table public.invoices
      add constraint invoices_invoice_status_check
      check (invoice_status in ('draft', 'sent', 'paid', 'void'));
  end if;
end $$;

create index if not exists invoices_workspace_status_idx
  on public.invoices (workspace_id, invoice_status);
