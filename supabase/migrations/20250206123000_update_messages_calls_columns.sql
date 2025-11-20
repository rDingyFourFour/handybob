-- Extend messages with richer linkage and metadata
alter table public.messages
  add column if not exists quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists to_address text,
  add column if not exists from_address text,
  add column if not exists via text default 'email',
  add column if not exists sent_at timestamptz;

-- Keep channel for backward compatibility; use via going forward
update public.messages
set via = coalesce(via, channel)
where true;

-- TODO: inbound email/SMS webhooks (e.g., /api/webhooks/email or /api/webhooks/sms) should:
--  - Find/create customer by from_address/phone.
--  - Attach job_id/quote_id/invoice_id when possible.
--  - Insert messages with direction = 'inbound' so customer replies appear in timelines.

create index if not exists messages_quote_id_idx on public.messages (quote_id);
create index if not exists messages_invoice_id_idx on public.messages (invoice_id);
create index if not exists messages_sent_at_idx on public.messages (sent_at desc);

-- Extend calls with richer metadata
alter table public.calls
  add column if not exists from_number text,
  add column if not exists to_number text,
  add column if not exists transcript text,
  add column if not exists ai_summary text,
  add column if not exists recording_url text;

-- TODO: inbound voice webhook (e.g., /api/webhooks/voice from Twilio) should:
--  - Match or create a customer by from_number.
--  - Attach job_id when a current job exists for that customer.
--  - Insert calls with direction = 'inbound', summary/ai_summary, and recording_url.

-- Indexes to keep lookups fast
create index if not exists calls_from_number_idx on public.calls (from_number);
create index if not exists calls_to_number_idx on public.calls (to_number);
