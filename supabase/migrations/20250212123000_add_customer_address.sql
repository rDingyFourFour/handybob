-- Add address field to customers for public lead capture.
alter table public.customers
  add column if not exists address text;
