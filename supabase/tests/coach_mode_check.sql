-- Checks the coach-mode rules against the real database without leaving a
-- trace: everything runs in one transaction that is rolled back at the end,
-- the migration and three made-up accounts included.
--
-- Run with scripts/check-coach-sql.mjs, which puts the migration in place of
-- the marker below and sends it with `supabase db query --linked`. Every row
-- of the result should say ok = true.

begin;
set local role postgres;

-- @@MIGRATION@@

create table public.zz_coach_check (n serial primary key, name text, ok boolean, detail text);
-- The project turns row-level security on for every new table; this scratch one needs it off.
alter table public.zz_coach_check disable row level security;
grant all on public.zz_coach_check to authenticated, anon;
grant usage on sequence public.zz_coach_check_n_seq to authenticated, anon;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'zz-coach@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'zz-athlete@example.invalid'),
  ('00000000-0000-4000-8000-0000000000f1', 'authenticated', 'authenticated', 'zz-stranger@example.invalid');
insert into public.user_states (user_id, data) values
  ('00000000-0000-4000-8000-0000000000a1', '{"weekLogs":[{"id":"w1"}],"programs":[],"plans":[],"currentWeek":3,"googleSheetsSettings":{"spreadsheetId":"secret"}}'),
  ('00000000-0000-4000-8000-0000000000f1', '{"weekLogs":[],"programs":[],"plans":[],"currentWeek":0}');
insert into public.coach_invites (code, coach_id, coach_name, group_name, expires_at) values
  ('OLD12345', '00000000-0000-4000-8000-0000000000c1', 'Koç Bir', null, now() - interval '1 day');

-- The coach makes an invite.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
insert into public.coach_invites (code, coach_name, group_name) values ('TEST2345', 'Koç Bir', 'Sabah');
insert into public.coach_templates (name, days) values ('Üst/Alt', '[]');
insert into public.zz_coach_check (name, ok, detail)
  select 'coach sees own invite', count(*) = 2, count(*)::text from public.coach_invites;
do $$ begin
  begin
    perform public.accept_coach_invite('TEST2345', 'Koç Bir');
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot join own team', false, 'joined');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot join own team', sqlerrm = 'own invite', sqlerrm);
  end;
end $$;

-- Before signing in, the link says who is inviting, nothing more.
set local role postgres;
select set_config('request.jwt.claims', '', true);
set local role anon;
insert into public.zz_coach_check (name, ok, detail)
  select 'anyone sees who invites', public.coach_invite_info('test2345') ->> 'coach_name' = 'Koç Bir', public.coach_invite_info('test2345')::text;
insert into public.zz_coach_check (name, ok, detail)
  select 'an expired link says nothing', public.coach_invite_info('OLD12345') is null, coalesce(public.coach_invite_info('OLD12345')::text, 'null');
do $$ begin
  begin
    perform count(*) from public.coach_invites;
    insert into public.zz_coach_check (name, ok, detail) values ('visitors cannot list invites', false, 'listed');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('visitors cannot list invites', true, sqlerrm);
  end;
end $$;

-- The athlete accepts.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.zz_coach_check (name, ok, detail)
  select 'athlete does not see the coach''s invites', count(*) = 0, count(*)::text from public.coach_invites;
insert into public.zz_coach_check (name, ok, detail)
  select 'athlete does not see the coach''s templates', count(*) = 0, count(*)::text from public.coach_templates;
do $$ begin
  begin
    perform public.accept_coach_invite('OLD12345', 'Sporcu Bir');
    insert into public.zz_coach_check (name, ok, detail) values ('an expired link cannot be accepted', false, 'joined');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('an expired link cannot be accepted', sqlerrm = 'invite not found', sqlerrm);
  end;
end $$;
insert into public.zz_coach_check (name, ok, detail)
  select 'athlete accepts', public.accept_coach_invite('test2345', 'Sporcu Bir') ->> 'coach_name' = 'Koç Bir', 'accepted';
insert into public.zz_coach_check (name, ok, detail)
  select 'athlete sees the link', count(*) = 1 and min(group_name) = 'Sabah', count(*)::text from public.coach_links;
do $$
declare changed integer;
begin
  update public.coach_links set group_name = 'Akşam';
  get diagnostics changed = row_count;
  insert into public.zz_coach_check (name, ok, detail) values ('athlete cannot regroup', changed = 0, changed::text);
  begin
    update public.coach_links set coach_id = '00000000-0000-4000-8000-0000000000f1';
    insert into public.zz_coach_check (name, ok, detail) values ('athlete cannot move the link', false, 'moved');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('athlete cannot move the link', true, sqlerrm);
  end;
  begin
    insert into public.coach_links (coach_id, athlete_id, coach_name, athlete_name)
      values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'X', 'Y');
    insert into public.zz_coach_check (name, ok, detail) values ('links are made only by accepting', false, 'inserted');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('links are made only by accepting', true, sqlerrm);
  end;
end $$;

-- The coach reads, comments and sends a program.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
insert into public.zz_coach_check (name, ok, detail)
  select 'coach reads the athlete''s record without the Sheet',
    count(*) = 1 and bool_and(data ? 'weekLogs') and not bool_or(data ? 'googleSheetsSettings'), count(*)::text
  from public.coach_athlete_states();
insert into public.zz_coach_check (name, ok, detail)
  select 'coach cannot read user_states directly', count(*) = 0, count(*)::text
  from public.user_states where user_id = '00000000-0000-4000-8000-0000000000a1';
insert into public.coach_comments (athlete_id, coach_name, program_id, week_number, text)
  values ('00000000-0000-4000-8000-0000000000a1', 'Koç Bir', 'p1', 3, 'Son seti tükenişe götür');
insert into public.coach_updates (athlete_id, coach_name, actions, lines, plan_id, plan_name, is_new)
  values ('00000000-0000-4000-8000-0000000000a1', 'Koç Bir', '[]', '["Yeni program: X"]', 'plan1', 'X', true);
do $$
declare changed integer;
begin
  update public.coach_links set group_name = 'Akşam' where athlete_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics changed = row_count;
  insert into public.zz_coach_check (name, ok, detail) values ('coach regroups', changed = 1, changed::text);
  begin
    update public.coach_links set athlete_id = '00000000-0000-4000-8000-0000000000f1';
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot point the link at someone else', false, 'moved');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot point the link at someone else', true, sqlerrm);
  end;
  begin
    insert into public.coach_comments (athlete_id, coach_name, program_id, week_number, text)
      values ('00000000-0000-4000-8000-0000000000f1', 'Koç Bir', 'p1', 0, 'x');
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot comment on a stranger', false, 'inserted');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot comment on a stranger', true, sqlerrm);
  end;
  begin
    insert into public.coach_updates (athlete_id, coach_name, actions, plan_id, plan_name)
      values ('00000000-0000-4000-8000-0000000000f1', 'Koç Bir', '[]', 'p', 'p');
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot send to a stranger', false, 'inserted');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot send to a stranger', true, sqlerrm);
  end;
  update public.coach_updates set seen_at = now();
  get diagnostics changed = row_count;
  insert into public.zz_coach_check (name, ok, detail) values ('only the athlete marks an update seen', changed = 0, changed::text);
  begin
    update public.user_states set data = '{}' where user_id = '00000000-0000-4000-8000-0000000000a1';
    get diagnostics changed = row_count;
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot write the athlete''s record', changed = 0, changed::text);
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot write the athlete''s record', true, sqlerrm);
  end;
end $$;

-- A stranger sees nothing of it.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
insert into public.zz_coach_check (name, ok, detail)
  select 'stranger sees no links, comments, updates or records',
    (select count(*) from public.coach_links) + (select count(*) from public.coach_comments)
      + (select count(*) from public.coach_updates) + (select count(*) from public.coach_athlete_states()) = 0, 'counted';
do $$ begin
  begin
    insert into public.coach_comments (coach_id, athlete_id, coach_name, program_id, week_number, text)
      values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'Koç Bir', 'p1', 3, 'sahte');
    insert into public.zz_coach_check (name, ok, detail) values ('nobody writes in the coach''s name', false, 'inserted');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('nobody writes in the coach''s name', true, sqlerrm);
  end;
end $$;

-- The athlete reads what came, marks it seen, and leaves.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.zz_coach_check (name, ok, detail)
  select 'athlete reads the comment and the update',
    (select count(*) from public.coach_comments) = 1 and (select count(*) from public.coach_updates) = 1, 'counted';
do $$
declare changed integer;
begin
  update public.coach_updates set seen_at = now();
  get diagnostics changed = row_count;
  insert into public.zz_coach_check (name, ok, detail) values ('athlete marks an update seen', changed = 1, changed::text);
  begin
    update public.coach_updates set actions = '[{"type":"RESET_DATA"}]';
    insert into public.zz_coach_check (name, ok, detail) values ('athlete cannot rewrite an update', false, 'rewritten');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('athlete cannot rewrite an update', true, sqlerrm);
  end;
  delete from public.coach_links;
  get diagnostics changed = row_count;
  insert into public.zz_coach_check (name, ok, detail) values ('athlete leaves', changed = 1, changed::text);
end $$;

-- After that the coach sees nothing more and cannot write.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
insert into public.zz_coach_check (name, ok, detail)
  select 'coach no longer reads the record', count(*) = 0, count(*)::text from public.coach_athlete_states();
do $$ begin
  begin
    insert into public.coach_comments (athlete_id, coach_name, program_id, week_number, text)
      values ('00000000-0000-4000-8000-0000000000a1', 'Koç Bir', 'p1', 3, 'x');
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot comment after the link ends', false, 'inserted');
  exception when others then
    insert into public.zz_coach_check (name, ok, detail) values ('coach cannot comment after the link ends', true, sqlerrm);
  end;
end $$;

set local role postgres;
select name, ok, detail from public.zz_coach_check order by n;
rollback;
