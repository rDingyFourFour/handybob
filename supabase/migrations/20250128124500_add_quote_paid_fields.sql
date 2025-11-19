alter table public.quotes
  add column if not exists paid_at timestamptz,
  add column if not exists stripe_payment_intent_id text;
