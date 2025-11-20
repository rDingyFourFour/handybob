-- Safety patch to realign schema after the DB wipe.
-- Adds any missing columns/indexes expected by app code & prior migrations.

-- Invoices: ensure due_at and latest columns exist, backfill from due_date if present.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'due_at'
  ) then
    alter table public.invoices
      add column due_at timestamptz;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'due_date'
  ) then
    update public.invoices
    set due_at = coalesce(due_at, due_date);
  end if;
end $$;

alter table public.invoices
  add column if not exists stripe_payment_link_url text,
  add column if not exists invoice_number integer,
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists line_items jsonb,
  add column if not exists subtotal numeric not null default 0,
  add column if not exists tax numeric not null default 0;

-- Messages: ensure richer metadata columns exist.
alter table public.messages
  add column if not exists status text not null default 'sent',
  add column if not exists direction text not null default 'outbound',
  add column if not exists quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists to_address text,
  add column if not exists from_address text,
  add column if not exists via text default 'email',
  add column if not exists sent_at timestamptz;

create index if not exists messages_quote_id_idx on public.messages (quote_id);
create index if not exists messages_invoice_id_idx on public.messages (invoice_id);
create index if not exists messages_sent_at_idx on public.messages (sent_at desc);

-- Calls: ensure core + extended columns exist.
alter table public.calls
  add column if not exists direction text not null default 'outbound',
  add column if not exists status text not null default 'completed',
  add column if not exists started_at timestamptz not null default timezone('utc', now()),
  add column if not exists duration_seconds integer default 0,
  add column if not exists summary text,
  add column if not exists recording_url text,
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists from_number text,
  add column if not exists to_number text,
  add column if not exists transcript text,
  add column if not exists ai_summary text;

create index if not exists calls_user_id_idx on public.calls (user_id);
create index if not exists calls_customer_id_idx on public.calls (customer_id);
create index if not exists calls_job_id_idx on public.calls (job_id);
create index if not exists calls_started_at_idx on public.calls (started_at desc);
create index if not exists calls_from_number_idx on public.calls (from_number);
create index if not exists calls_to_number_idx on public.calls (to_number);

-- Media: ensure type + columns + storage bucket exist.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_kind') then
    create type public.media_kind as enum ('photo', 'document', 'audio', 'other');
  end if;
end $$;

-- Ensure bucket exists for job media.
insert into storage.buckets (id, name, public)
values ('job-media', 'job-media', false)
on conflict (id) do nothing;

alter table public.media
  add column if not exists bucket_id text not null default 'job-media',
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists url text,
  add column if not exists kind public.media_kind default 'other',
  add column if not exists caption text,
  alter column created_at set default timezone('utc', now());

create index if not exists media_user_id_idx on public.media (user_id);
create index if not exists media_job_id_idx on public.media (job_id);
create index if not exists media_created_at_idx on public.media (created_at desc);
