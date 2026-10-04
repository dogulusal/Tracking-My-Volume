-- Coach mode: a coach follows the workouts of the people who accepted their
-- invite, leaves notes and comments, and sets up programs for them.
--
-- Nothing here changes user_states or its policies. A coach never writes an
-- athlete's record: program changes go into coach_updates and the athlete's
-- own app applies them to its own record. A coach reads a linked athlete's
-- record only through coach_athlete_states(), which leaves out the Google
-- Sheet settings.
--
-- Who may do what is decided here, by row-level security and column grants,
-- not by the app:
--   coach_invites   the coach's own links; anyone may look one up by its code
--   coach_links     made only by accept_coach_invite(); either side may end it;
--                   the coach may change only the group
--   coach_comments  written by the coach of a linked athlete; read by both
--   coach_updates   written by the coach of a linked athlete; read by both;
--                   the athlete may only mark one seen
--   coach_templates the coach's saved programs, theirs alone

create table if not exists public.coach_invites (
  code text primary key check (code ~ '^[A-Z0-9]{6,12}$'),
  coach_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  coach_name text not null check (char_length(coach_name) between 1 and 80),
  group_name text check (group_name is null or char_length(group_name) between 1 and 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index if not exists coach_invites_coach on public.coach_invites (coach_id);

create table if not exists public.coach_links (
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  coach_name text not null check (char_length(coach_name) between 1 and 80),
  athlete_name text not null check (char_length(athlete_name) between 1 and 80),
  group_name text check (group_name is null or char_length(group_name) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id),
  check (coach_id <> athlete_id)
);
create index if not exists coach_links_athlete on public.coach_links (athlete_id);

create table if not exists public.coach_comments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  coach_name text not null check (char_length(coach_name) between 1 and 80),
  program_id text not null check (char_length(program_id) between 1 and 200),
  week_number integer not null check (week_number between 0 and 10000),
  -- '' for a note on the whole workout.
  exercise_id text not null default '' check (char_length(exercise_id) <= 200),
  exercise_name text not null default '' check (char_length(exercise_name) <= 200),
  day_name text check (day_name is null or char_length(day_name) <= 200),
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists coach_comments_athlete on public.coach_comments (athlete_id, created_at);
create index if not exists coach_comments_coach on public.coach_comments (coach_id, created_at);

create table if not exists public.coach_updates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  coach_name text not null check (char_length(coach_name) between 1 and 80),
  -- The app's own program actions; the athlete's app lets through only those
  -- a coach may make (src/context/appReducer.ts applyCoachUpdate).
  actions jsonb not null check (jsonb_typeof(actions) = 'array' and pg_column_size(actions) < 300000),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and pg_column_size(lines) < 20000),
  plan_id text not null check (char_length(plan_id) between 1 and 200),
  plan_name text not null check (char_length(plan_name) between 1 and 200),
  is_new boolean not null default false,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists coach_updates_athlete on public.coach_updates (athlete_id, created_at);
create index if not exists coach_updates_coach on public.coach_updates (coach_id, created_at);

create table if not exists public.coach_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  days jsonb not null check (jsonb_typeof(days) = 'array' and pg_column_size(days) < 100000),
  created_at timestamptz not null default now()
);
create index if not exists coach_templates_coach on public.coach_templates (coach_id, created_at);

alter table public.coach_invites enable row level security;
alter table public.coach_links enable row level security;
alter table public.coach_comments enable row level security;
alter table public.coach_updates enable row level security;
alter table public.coach_templates enable row level security;

-- Nothing for visitors who are not signed in; signed-in people only through the policies.
revoke all on public.coach_invites, public.coach_links, public.coach_comments, public.coach_updates, public.coach_templates from anon;
revoke all on public.coach_invites, public.coach_links, public.coach_comments, public.coach_updates, public.coach_templates from authenticated;
grant select, insert, delete on public.coach_invites to authenticated;
grant select, delete on public.coach_links to authenticated;
grant update (group_name) on public.coach_links to authenticated;
grant select, insert, delete on public.coach_comments to authenticated;
grant select, insert on public.coach_updates to authenticated;
grant update (seen_at) on public.coach_updates to authenticated;
grant select, insert, delete on public.coach_templates to authenticated;

create or replace function public.is_coach_of(athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.coach_links where coach_id = auth.uid() and athlete_id = athlete);
$$;
revoke all on function public.is_coach_of(uuid) from public, anon;
grant execute on function public.is_coach_of(uuid) to authenticated;

drop policy if exists "Coaches manage own invites" on public.coach_invites;
create policy "Coaches manage own invites" on public.coach_invites
for all to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

drop policy if exists "Both sides see their links" on public.coach_links;
create policy "Both sides see their links" on public.coach_links
for select to authenticated
using (auth.uid() = coach_id or auth.uid() = athlete_id);

drop policy if exists "Either side ends a link" on public.coach_links;
create policy "Either side ends a link" on public.coach_links
for delete to authenticated
using (auth.uid() = coach_id or auth.uid() = athlete_id);

drop policy if exists "Coaches group their athletes" on public.coach_links;
create policy "Coaches group their athletes" on public.coach_links
for update to authenticated
using (auth.uid() = coach_id)
with check (auth.uid() = coach_id);

drop policy if exists "Both sides read comments" on public.coach_comments;
create policy "Both sides read comments" on public.coach_comments
for select to authenticated
using (auth.uid() = coach_id or auth.uid() = athlete_id);

drop policy if exists "Coaches comment on their athletes" on public.coach_comments;
create policy "Coaches comment on their athletes" on public.coach_comments
for insert to authenticated
with check (coach_id = auth.uid() and public.is_coach_of(athlete_id));

drop policy if exists "Coaches delete own comments" on public.coach_comments;
create policy "Coaches delete own comments" on public.coach_comments
for delete to authenticated
using (coach_id = auth.uid());

drop policy if exists "Both sides read updates" on public.coach_updates;
create policy "Both sides read updates" on public.coach_updates
for select to authenticated
using (auth.uid() = coach_id or auth.uid() = athlete_id);

drop policy if exists "Coaches send updates to their athletes" on public.coach_updates;
create policy "Coaches send updates to their athletes" on public.coach_updates
for insert to authenticated
with check (coach_id = auth.uid() and public.is_coach_of(athlete_id));

drop policy if exists "Athletes mark updates seen" on public.coach_updates;
create policy "Athletes mark updates seen" on public.coach_updates
for update to authenticated
using (auth.uid() = athlete_id)
with check (auth.uid() = athlete_id);

drop policy if exists "Coaches manage own templates" on public.coach_templates;
create policy "Coaches manage own templates" on public.coach_templates
for all to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

-- Who an invite is from, for the screen that asks the athlete. Works before
-- signing in too, so the sign-in screen can say who is inviting.
create or replace function public.coach_invite_info(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('coach_id', i.coach_id, 'coach_name', i.coach_name, 'group_name', i.group_name)
  from public.coach_invites i
  where i.code = upper(p_code) and i.expires_at > now();
$$;
revoke all on function public.coach_invite_info(text) from public;
grant execute on function public.coach_invite_info(text) to anon, authenticated;

-- The athlete says yes: the only way a link is made, always for the person
-- signed in, never for one's own invite.
create or replace function public.accept_coach_invite(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite public.coach_invites%rowtype;
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select * into invite from public.coach_invites where code = upper(p_code) and expires_at > now();
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if invite.coach_id = me then
    raise exception 'own invite' using errcode = '22023';
  end if;
  insert into public.coach_links as l (coach_id, athlete_id, coach_name, athlete_name, group_name)
  values (invite.coach_id, me, invite.coach_name, left(coalesce(nullif(trim(p_name), ''), 'Sporcu'), 80), invite.group_name)
  on conflict (coach_id, athlete_id) do update
    set coach_name = excluded.coach_name, athlete_name = excluded.athlete_name, group_name = excluded.group_name;
  return jsonb_build_object('coach_id', invite.coach_id, 'coach_name', invite.coach_name);
end;
$$;
revoke all on function public.accept_coach_invite(text, text) from public, anon;
grant execute on function public.accept_coach_invite(text, text) to authenticated;

-- The coach side: the records of everyone linked to the caller, as their own
-- app last saved them, without the Google Sheet settings.
create or replace function public.coach_athlete_states()
returns table (athlete_id uuid, data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.user_id, s.data - 'googleSheetsSettings' - 'sheetColumnMappings', s.updated_at
  from public.user_states s
  join public.coach_links l on l.athlete_id = s.user_id
  where l.coach_id = auth.uid();
$$;
revoke all on function public.coach_athlete_states() from public, anon;
grant execute on function public.coach_athlete_states() to authenticated;
