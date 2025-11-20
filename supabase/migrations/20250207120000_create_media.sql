create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Bucket for job media (photos + documents). Private by default.
insert into storage.buckets (id, name, public)
values ('job-media', 'job-media', false)
on conflict (id) do nothing;

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  bucket_id text not null default 'job-media',
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists media_user_id_idx on public.media (user_id);
create index if not exists media_job_id_idx on public.media (job_id);
create index if not exists media_created_at_idx on public.media (created_at desc);

alter table public.media enable row level security;

drop policy if exists "Allow select own media" on public.media;
create policy "Allow select own media"
on public.media
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own media" on public.media;
create policy "Allow insert own media"
on public.media
for insert
with check (user_id = auth.uid());

drop policy if exists "Allow update own media" on public.media;
create policy "Allow update own media"
on public.media
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Allow delete own media" on public.media;
create policy "Allow delete own media"
on public.media
for delete
using (user_id = auth.uid());

-- Storage RLS for the job-media bucket (skip if current role is not the table owner)
do $$
declare
  is_owner boolean := false;
begin
  select c.relowner = coalesce((select oid from pg_roles where rolname = current_user), 0)
  into is_owner
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage' and c.relname = 'objects';

  if is_owner then
    execute 'alter table storage.objects enable row level security';
    execute 'drop policy if exists "Allow access to own job media" on storage.objects';
    execute 'create policy "Allow access to own job media" on storage.objects for select using (bucket_id = ''job-media'' and owner = auth.uid())';
    execute 'drop policy if exists "Allow insert job media" on storage.objects';
    execute 'create policy "Allow insert job media" on storage.objects for insert with check (bucket_id = ''job-media'' and owner = auth.uid())';
    execute 'drop policy if exists "Allow delete own job media" on storage.objects';
    execute 'create policy "Allow delete own job media" on storage.objects for delete using (bucket_id = ''job-media'' and owner = auth.uid())';
  end if;
end $$;
