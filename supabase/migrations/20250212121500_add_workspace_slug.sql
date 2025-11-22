-- Workspace slugs + explicit public lead form toggle.

alter table public.workspaces
  add column if not exists slug text,
  add column if not exists public_lead_form_enabled boolean not null default true;

-- Derive slugs for existing rows from brand/name and ensure uniqueness.
with base as (
  select
    id,
    coalesce(
      nullif(
        regexp_replace(
          regexp_replace(lower(coalesce(brand_name, name, 'workspace')), '[^a-z0-9]+', '-', 'g'),
          '-{2,}',
          '-',
          'g'
        ),
        ''
      ),
      'workspace'
    ) as slug_base
  from public.workspaces
),
dedup as (
  select
    id,
    slug_base,
    row_number() over (partition by slug_base order by id) as rn
  from base
)
update public.workspaces w
set slug = case when d.rn = 1 then d.slug_base else d.slug_base || '-' || d.rn end
from dedup d
where w.id = d.id and (w.slug is null or w.slug = '');

update public.workspaces
set public_lead_form_enabled = coalesce(public_leads_enabled, true)
where public_lead_form_enabled is null;

alter table public.workspaces
  alter column slug set not null;

create unique index if not exists workspaces_slug_unique on public.workspaces (slug);
