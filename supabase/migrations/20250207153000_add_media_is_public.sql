-- Allow flagging which media can appear on public quote/invoice views
alter table public.media
  add column if not exists is_public boolean not null default false;

create index if not exists media_is_public_idx on public.media (is_public);
