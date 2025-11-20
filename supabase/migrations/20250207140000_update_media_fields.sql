-- Align media table with required columns and RLS pattern
do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_kind') then
    create type public.media_kind as enum ('photo', 'document', 'audio', 'other');
  end if;
end $$;

-- Ensure required columns exist (id exists from prior migration)
alter table public.media
  alter column job_id drop not null,
  add column if not exists url text,
  add column if not exists kind public.media_kind default 'other',
  add column if not exists caption text,
  alter column created_at set default timezone('utc', now());

-- RLS: ensure policies follow user_id = auth.uid()
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
