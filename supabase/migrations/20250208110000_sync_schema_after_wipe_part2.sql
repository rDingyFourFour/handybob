-- Additional schema reconciliation after DB wipe.
-- Ensures invoices, messages, and calls have all columns used by the app.

-- Invoices: add any missing customer + metadata fields.
alter table public.invoices
  add column if not exists status text not null default 'draft',
  add column if not exists total numeric not null default 0,
  add column if not exists issued_at timestamptz not null default timezone('utc', now()),
  add column if not exists paid_at timestamptz,
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists invoices_public_token_idx on public.invoices (public_token);

-- Messages: add any missing metadata columns.
alter table public.messages
  add column if not exists channel text not null default 'email',
  add column if not exists subject text,
  add column if not exists body text,
  add column if not exists external_id text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

-- Calls: add missing timestamps and status fields.
alter table public.calls
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists status text not null default 'completed',
  add column if not exists direction text not null default 'outbound';
