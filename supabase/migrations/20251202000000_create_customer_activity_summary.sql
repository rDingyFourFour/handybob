drop view if exists public.customer_activity_summary;

create view public.customer_activity_summary as
select
  c.workspace_id,
  c.id as customer_id,
  act.timestamp as last_activity_at,
  act.kind as last_activity_kind
from public.customers c
left join lateral (
  select kind, timestamp
  from (
    select 'job' as kind, max(j.updated_at) as timestamp
    from public.jobs j
    where j.workspace_id = c.workspace_id
      and j.customer_id = c.id
    union all
    select 'quote' as kind, max(q.created_at) as timestamp
    from public.quotes q
    join public.jobs j on j.id = q.job_id
    where q.workspace_id = c.workspace_id
      and j.workspace_id = c.workspace_id
      and j.customer_id = c.id
    union all
    select 'call' as kind, max(cl.created_at) as timestamp
    from public.calls cl
    where cl.workspace_id = c.workspace_id
      and cl.customer_id = c.id
    union all
    select 'message' as kind, max(msg.created_at) as timestamp
    from public.messages msg
    where msg.workspace_id = c.workspace_id
      and msg.customer_id = c.id
  ) summary
  where summary.timestamp is not null
  order by summary.timestamp desc
  limit 1
) act on true;
