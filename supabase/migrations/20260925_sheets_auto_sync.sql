-- Server-owned Google credentials and a coalescing work queue.
create table if not exists public.sheet_auto_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  spreadsheet_id text not null,
  refresh_token_ciphertext text not null,
  managed_tabs jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'reauthorize')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sheet_auto_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1,
  status text not null default 'pending' check (status in ('pending', 'processing', 'error')),
  attempts integer not null default 0,
  due_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.sheet_auto_connections enable row level security;
alter table public.sheet_auto_queue enable row level security;
revoke all on public.sheet_auto_connections from anon, authenticated;
revoke all on public.sheet_auto_queue from anon, authenticated;

create or replace function public.enqueue_sheet_auto_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.sheet_auto_connections where user_id = new.user_id and status = 'active') then
    insert into public.sheet_auto_queue (user_id, status, due_at, attempts, last_error)
    values (new.user_id, 'pending', now(), 0, null)
    on conflict (user_id) do update set
      revision = public.sheet_auto_queue.revision + 1, status = 'pending', due_at = now(),
      attempts = 0, last_error = null, updated_at = now();
  end if;
  return new;
end $$;

create or replace function public.request_sheet_auto_sync(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.sheet_auto_queue (user_id, status, due_at, attempts, last_error)
  values (target_user_id, 'pending', now(), 0, null)
  on conflict (user_id) do update set
    revision = public.sheet_auto_queue.revision + 1, status = 'pending', due_at = now(),
    attempts = 0, last_error = null, updated_at = now();
end $$;

revoke all on function public.request_sheet_auto_sync(uuid) from public, anon, authenticated;
grant execute on function public.request_sheet_auto_sync(uuid) to service_role;

drop trigger if exists user_state_sheet_auto_sync on public.user_states;
create trigger user_state_sheet_auto_sync after insert or update of data on public.user_states
for each row execute function public.enqueue_sheet_auto_sync();

create or replace function public.claim_sheet_auto_sync(batch_size integer default 5)
returns table (claimed_user_id uuid, claimed_revision bigint)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select q.user_id from public.sheet_auto_queue q
    join public.sheet_auto_connections c on c.user_id = q.user_id and c.status = 'active'
    where ((q.status in ('pending', 'error') and q.due_at <= now())
      or (q.status = 'processing' and q.locked_at < now() - interval '5 minutes'))
    order by q.due_at
    for update of q skip locked
    limit least(greatest(batch_size, 1), 10)
  ), claimed as (
    update public.sheet_auto_queue q set status = 'processing', locked_at = now(), updated_at = now()
    from candidates c where q.user_id = c.user_id
    returning q.user_id, q.revision
  )
  select claimed.user_id, claimed.revision from claimed;
end $$;

revoke all on function public.claim_sheet_auto_sync(integer) from public, anon, authenticated;
grant execute on function public.claim_sheet_auto_sync(integer) to service_role;
