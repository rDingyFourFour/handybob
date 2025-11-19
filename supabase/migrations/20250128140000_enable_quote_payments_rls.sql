alter table public.quote_payments enable row level security;

drop policy if exists "Allow select own quote payments" on public.quote_payments;

create policy "Allow select own quote payments"
on public.quote_payments
for select
using (user_id = auth.uid());
