-- Restore points for user_states. The app saves the whole state into one row
-- and overwrites it on every save, so a bad write (an old backup imported, a
-- reset, a bug on one device) replaced the only cloud copy with no way back.
--
-- Before an update the trigger keeps the row as it was:
--   * once a day (the first save after 20 hours), and
--   * whenever the save holds fewer workouts than before, which is what an
--     import, a reset or a restore of an older copy looks like.
-- Copies older than 30 days are dropped. Users can read their own copies;
-- only the trigger writes them.

create table if not exists public.user_state_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  workouts integer generated always as (
    case when jsonb_typeof(data -> 'weekLogs') = 'array' then jsonb_array_length(data -> 'weekLogs') else 0 end
  ) stored,
  reason text not null check (reason in ('daily', 'shrink')),
  taken_at timestamptz not null default now()
);

create index if not exists user_state_snapshots_user_taken
  on public.user_state_snapshots (user_id, taken_at desc);

alter table public.user_state_snapshots enable row level security;

drop policy if exists "Users can read own snapshots" on public.user_state_snapshots;
create policy "Users can read own snapshots"
on public.user_state_snapshots
for select
using (auth.uid() = user_id);

create or replace function public.snapshot_user_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_count integer := case when jsonb_typeof(old.data -> 'weekLogs') = 'array' then jsonb_array_length(old.data -> 'weekLogs') else 0 end;
  new_count integer := case when jsonb_typeof(new.data -> 'weekLogs') = 'array' then jsonb_array_length(new.data -> 'weekLogs') else 0 end;
begin
  if new_count < old_count then
    insert into public.user_state_snapshots (user_id, data, reason) values (old.user_id, old.data, 'shrink');
  elsif not exists (
    select 1 from public.user_state_snapshots
    where user_id = old.user_id and taken_at > now() - interval '20 hours'
  ) then
    insert into public.user_state_snapshots (user_id, data, reason) values (old.user_id, old.data, 'daily');
  end if;
  delete from public.user_state_snapshots
  where user_id = old.user_id and taken_at < now() - interval '30 days';
  return new;
end;
$$;

revoke all on function public.snapshot_user_state() from public;

drop trigger if exists user_states_snapshot on public.user_states;
create trigger user_states_snapshot
before update on public.user_states
for each row
when (old.data is distinct from new.data)
execute function public.snapshot_user_state();
