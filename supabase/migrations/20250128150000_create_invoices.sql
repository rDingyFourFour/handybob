create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'draft',
  total numeric not null default 0,
  issued_at timestamptz not null default timezone('utc', now()),
  due_at timestamptz,
  paid_at timestamptz,
  public_token uuid not null default gen_random_uuid(),
  customer_name text,
  customer_email text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.invoices
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists invoices_quote_id_idx
  on public.invoices (quote_id);

create unique index if not exists invoices_public_token_idx
  on public.invoices (public_token);

create index if not exists invoices_user_id_idx
  on public.invoices (user_id);

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
