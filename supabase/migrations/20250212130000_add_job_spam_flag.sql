-- Flag suspected spam leads created from public forms.
alter table public.jobs
  add column if not exists spam_suspected boolean not null default false;
