import { supabase } from '@/lib/supabase';
import { applyMigrations } from '@/data/migrations';
import type { AppAction, AppState } from '@/types';
import type { CoachComment, NewComment } from './comments';
import type { ProgramTemplate } from './templates';

// The coach tables (supabase/migrations/*_coach_mode.sql). Row-level security
// decides what each person may read or write: a coach their own invites,
// links, comments, updates and saved programs; an athlete their links and
// what their coaches sent them. A coach reads an athlete's record only through
// coach_athlete_states(), and never writes it.

export interface LinkRow {
  coach_id: string;
  athlete_id: string;
  coach_name: string;
  athlete_name: string;
  group_name: string | null;
  created_at: string;
}
export interface InviteRow { code: string; group_name: string | null; expires_at: string }
interface CommentRow {
  id: string; coach_id: string; athlete_id: string; coach_name: string;
  program_id: string; week_number: number; exercise_id: string; exercise_name: string; day_name: string | null;
  text: string; created_at: string;
}
export interface UpdateRow {
  id: string; coach_id: string; athlete_id: string; coach_name: string;
  actions: AppAction[]; lines: string[]; plan_id: string; plan_name: string; is_new: boolean;
  created_at: string; seen_at: string | null;
}
interface TemplateRow { id: string; name: string; days: ProgramTemplate['days']; created_at: string }

export interface CommentOf extends CoachComment { athleteId: string; coachId: string }

const client = () => {
  if (!supabase) throw new Error('Bulut bağlantısı yok.');
  return supabase;
};
/** Rows or the error, as a thrown Error the caller shows. */
async function rows<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

const toComment = (row: CommentRow): CommentOf => ({
  id: row.id, athleteId: row.athlete_id, coachId: row.coach_id,
  programId: row.program_id, weekNumber: row.week_number, exerciseId: row.exercise_id, exerciseName: row.exercise_name,
  ...(row.day_name ? { dayName: row.day_name } : {}),
  text: row.text, at: row.created_at, author: row.coach_name,
});
const toTemplate = (row: TemplateRow): ProgramTemplate => ({ id: row.id, name: row.name, savedAt: row.created_at, days: row.days });

export const loadLinks = () => rows<LinkRow[]>(client().from('coach_links').select('*').order('created_at'));
export const loadInvites = () => rows<InviteRow[]>(client().from('coach_invites').select('code, group_name, expires_at').order('created_at'));

/** The coach side: the records of everyone linked, as their own app last saved them. */
export async function loadAthleteStates(): Promise<Record<string, AppState>> {
  const data = await rows<{ athlete_id: string; data: AppState }[]>(client().rpc('coach_athlete_states'));
  return Object.fromEntries(data.filter(row => row.data && Array.isArray(row.data.weekLogs))
    .map(row => [row.athlete_id, applyMigrations(row.data)]));
}

export const loadComments = async (column: 'coach_id' | 'athlete_id', userId: string) =>
  (await rows<CommentRow[]>(client().from('coach_comments').select('*').eq(column, userId).order('created_at'))).map(toComment);

export const loadUpdates = (column: 'coach_id' | 'athlete_id', userId: string) =>
  rows<UpdateRow[]>(client().from('coach_updates').select('*').eq(column, userId).order('created_at', { ascending: false }).limit(200))
    .then(list => list.reverse());

export const loadTemplates = async () =>
  (await rows<TemplateRow[]>(client().from('coach_templates').select('id, name, days, created_at').order('created_at', { ascending: false }))).map(toTemplate);

export async function addComment(athleteId: string, coachName: string, comment: NewComment): Promise<CommentOf> {
  const row = await rows<CommentRow>(client().from('coach_comments').insert({
    athlete_id: athleteId, coach_name: coachName,
    program_id: comment.programId, week_number: comment.weekNumber,
    exercise_id: comment.exerciseId, exercise_name: comment.exerciseName, day_name: comment.dayName ?? null,
    text: comment.text,
  }).select('*').single());
  return toComment(row);
}

export const sendUpdate = (athleteId: string, coachName: string, update: { actions: AppAction[]; lines: string[]; planId: string; planName: string; isNew: boolean }) =>
  rows<UpdateRow>(client().from('coach_updates').insert({
    athlete_id: athleteId, coach_name: coachName, actions: update.actions, lines: update.lines,
    plan_id: update.planId, plan_name: update.planName, is_new: update.isNew,
  }).select('*').single());

export const markUpdateSeen = (id: string) =>
  rows(client().from('coach_updates').update({ seen_at: new Date().toISOString() }).eq('id', id));

export const saveTemplate = async (template: Pick<ProgramTemplate, 'name' | 'days'>) =>
  toTemplate(await rows<TemplateRow>(client().from('coach_templates').insert(template).select('id, name, days, created_at').single()));
export const removeTemplate = (id: string) => rows(client().from('coach_templates').delete().eq('id', id));

export async function createInvite(code: string, coachName: string, group: string | null): Promise<InviteRow> {
  return rows<InviteRow>(client().from('coach_invites').insert({ code, coach_name: coachName, group_name: group })
    .select('code, group_name, expires_at').single());
}
/** The group's links stop working; used when a new one replaces them. */
export const removeInvites = (group: string | null) => {
  const query = client().from('coach_invites').delete();
  return rows(group === null ? query.is('group_name', null) : query.eq('group_name', group));
};

export const setGroup = (coachId: string, athleteId: string, group: string | null) =>
  rows(client().from('coach_links').update({ group_name: group }).eq('coach_id', coachId).eq('athlete_id', athleteId));
/** Either side ends the link: the coach removing an athlete, the athlete leaving. */
export const removeLink = (coachId: string, athleteId: string) =>
  rows(client().from('coach_links').delete().eq('coach_id', coachId).eq('athlete_id', athleteId));

/** Who sent the link, for the screen that asks; null when it expired or was renewed. */
export async function inviteInfo(code: string): Promise<{ coachId: string; coach: string; group: string | null } | null> {
  const data = await rows<{ coach_id: string; coach_name: string; group_name: string | null } | null>(
    client().rpc('coach_invite_info', { p_code: code }));
  return data ? { coachId: data.coach_id, coach: data.coach_name, group: data.group_name } : null;
}

export const acceptInvite = (code: string, name: string) =>
  rows<{ coach_id: string; coach_name: string }>(client().rpc('accept_coach_invite', { p_code: code, p_name: name }));
