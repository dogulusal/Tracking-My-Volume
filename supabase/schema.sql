create table if not exists public.user_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_states enable row level security;

drop policy if exists "Users can read own state" on public.user_states;
create policy "Users can read own state"
on public.user_states
for select
using (auth.uid() = user_id);

drop policy if exists "Users can upsert own state" on public.user_states;
create policy "Users can upsert own state"
on public.user_states
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own state" on public.user_states;
create policy "Users can update own state"
on public.user_states
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
