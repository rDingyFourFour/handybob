create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'draft',
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  line_items jsonb,
  client_message_template text,
  public_token uuid not null default gen_random_uuid(),
  public_expires_at timestamptz,
  stripe_payment_link_url text,
  accepted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists quotes_user_id_idx on public.quotes (user_id);
create index if not exists quotes_job_id_idx on public.quotes (job_id);
create unique index if not exists quotes_public_token_idx on public.quotes (public_token);

alter table public.quotes enable row level security;

drop policy if exists "Allow select own quotes" on public.quotes;
create policy "Allow select own quotes"
on public.quotes
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own quotes" on public.quotes;
create policy "Allow insert own quotes"
on public.quotes
for insert
with check (user_id = auth.uid());

drop policy if exists "Allow update own quotes" on public.quotes;
create policy "Allow update own quotes"
on public.quotes
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
