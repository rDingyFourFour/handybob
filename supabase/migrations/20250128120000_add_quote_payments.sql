create table if not exists public.quote_payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  amount numeric not null,
  currency text not null default 'USD',
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text,
  stripe_payment_link_id text,
  stripe_event_id text,
  customer_email text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists quote_payments_quote_id_idx
  on public.quote_payments (quote_id);

create index if not exists quote_payments_user_id_idx
  on public.quote_payments (user_id);
