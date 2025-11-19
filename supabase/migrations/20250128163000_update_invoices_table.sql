create extension if not exists "uuid-ossp";

alter table public.invoices
  add column if not exists public_token uuid not null default uuid_generate_v4(),
  add column if not exists invoice_number integer,
  add column if not exists paid_at timestamptz,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_payment_link_url text;

update public.invoices
set public_token = coalesce(public_token, uuid_generate_v4())
where public_token is null;

update public.invoices as inv
set invoice_number = seq.new_number
from (
  select id,
    row_number() over (partition by user_id order by issued_at, created_at, id) as new_number
  from public.invoices
  where user_id is not null
) as seq
where inv.id = seq.id
  and inv.invoice_number is null;

create table if not exists public.invoice_number_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_number integer not null default 0
);

create or replace function public.assign_invoice_number()
returns trigger as $$
declare
  next_number integer;
begin
  if new.user_id is null then
    raise exception 'invoice requires user_id for numbering';
  end if;

  if new.invoice_number is null then
    insert into public.invoice_number_counters as counter (user_id, last_number)
    values (new.user_id, 1)
    on conflict (user_id)
    do update set last_number = counter.last_number + 1
    returning counter.last_number into next_number;

    new.invoice_number = next_number;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path=public;

drop trigger if exists set_invoice_number on public.invoices;
create trigger set_invoice_number
before insert on public.invoices
for each row execute function public.assign_invoice_number();

alter table public.invoices enable row level security;

drop policy if exists "Allow select own invoices" on public.invoices;
create policy "Allow select own invoices"
on public.invoices
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own invoices" on public.invoices;
create policy "Allow insert own invoices"
on public.invoices
for insert
with check (user_id = auth.uid());

drop policy if exists "Allow update own invoices" on public.invoices;
create policy "Allow update own invoices"
on public.invoices
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
