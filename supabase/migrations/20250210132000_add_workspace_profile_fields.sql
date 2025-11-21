-- Workspace/business profile fields for branding and contact info.
alter table public.workspaces
  add column if not exists brand_name text,
  add column if not exists brand_tagline text,
  add column if not exists business_email text,
  add column if not exists business_phone text,
  add column if not exists business_address text;

comment on column public.workspaces.brand_name is 'Display/business name used in emails and public pages.';
comment on column public.workspaces.brand_tagline is 'Short tagline shown in emails and public pages.';
comment on column public.workspaces.business_email is 'Contact email for the business.';
comment on column public.workspaces.business_phone is 'Contact phone for the business.';
comment on column public.workspaces.business_address is 'Mailing or service address for the business.';

-- Existing installs: seed brand_name from workspace name when blank.
update public.workspaces
set brand_name = coalesce(brand_name, name)
where brand_name is null;
