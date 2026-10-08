import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppAction, AppState } from '@/types';
import { AppContext } from '@/context/AppContext';
import { applyCoachUpdate, initialState } from '@/context/appReducer';
import { supabase } from '@/lib/supabase';
import { DEMO_COACH, DEMO_COACH_ID, DEMO_TEMPLATES, demoAthletes, demoAthleteState } from './demo/athletes';
import { addDayActions, coachPlanOf, newPlanActions, templateFrom, type CoachRef, type ProgramTemplate } from './templates';
import { demoCoachMessages } from './demo/coachMessages';
import { needsAttention, summarizeAthlete, type AthleteSummary } from './summary';
import { describeProgramChanges } from './programChanges';
import type { CoachComment, NewComment } from './comments';
import { INVITE_DAYS, newInviteCode } from './text';
import * as cloud from './cloud';

export { possessive, dative, sinceText, inviteUrl, INVITE_DAYS } from './text';
export type { ProgramTemplate };

/** Set only when building the coach-mode demo; the real app never has it. */
export const DEMO = import.meta.env.VITE_DEMO === 'antrenor';

/** Someone in the coach's team. */
export interface Athlete { id: string; name: string; group: string | null; joinedAt: string }

/** A coach who can see this person's records (the athlete side). */
export interface MyCoach { id: string; name: string; since: string }

/**
 * Program changes a coach sent: the same actions the athlete's app would
 * dispatch had they made the change themselves, so earlier weeks keep the
 * program they were trained on.
 */
export interface ProgramUpdate {
  id: string;
  at: string;
  actions: AppAction[];
  lines: string[];
  /** The coach's plan it changes; `isNew` when this update sets the plan up. */
  planId: string;
  planName: string;
  isNew: boolean;
  /** When the athlete closed its card on Bugün; null before, absent in the demo. */
  seenAt?: string | null;
}
/**
 * Where a sent update is: sent (the athlete's app has not opened since),
 * applied (their program has it, the card not looked at yet) or seen.
 */
export type UpdateStatus = 'sent' | 'applied' | 'seen';
export interface ReceivedUpdate extends ProgramUpdate { coach: string; coachId: string; seen: boolean }

export interface Invite { code: string; expiresAt: string }
export interface InviteInfo { coachId: string; coach: string; group: string | null }

interface CoachData {
  athletes: Athlete[];
  groups: string[];
  /** The current invite per group ('' = no group). */
  invites: Record<string, Invite>;
  coaches: MyCoach[];
  /** Coach side, per athlete: comments written, program edits not sent yet, updates sent. */
  comments: Record<string, CoachComment[]>;
  drafts: Record<string, AppAction[]>;
  sent: Record<string, ProgramUpdate[]>;
  /** Athlete side: what this person's coaches sent them. */
  inbox: { updates: ReceivedUpdate[]; comments: CoachComment[] };
  /** Programs the coach saved, to start someone's program from. */
  library: ProgramTemplate[];
  /** Live: each athlete's record as their own app last saved it. Never cached. */
  records: Record<string, AppState>;
}

const DEMO_KEY = 'tmv-antrenor-demo-v3';
const cacheKey = (userId: string) => `tmv-antrenor:${userId}`;
// Coming back to the app refreshes what coaches and athletes sent, at most this often.
const REFRESH_MS = 30000;
const DAY_MS = 86400000;

const newId = () => Math.random().toString(36).slice(2, 10);
const far = () => new Date(Date.now() + 365 * DAY_MS).toISOString();

const emptyData = (): CoachData => ({
  athletes: [], groups: [], invites: {}, coaches: [], comments: {}, drafts: {}, sent: {},
  inbox: { updates: [], comments: [] }, library: [], records: {},
});

const demoData = (): CoachData => ({
  ...emptyData(),
  athletes: demoAthletes(new Date()),
  groups: ['Sabah grubu', 'Online'],
  invites: { '': { code: 'K7Q2MD', expiresAt: far() }, 'Sabah grubu': { code: 'S4BH9R', expiresAt: far() }, Online: { code: 'N8LV3T', expiresAt: far() } },
  library: DEMO_TEMPLATES,
});

function readStored(key: string): Partial<CoachData> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<CoachData> | null;
    return saved && Array.isArray(saved.athletes) ? saved : null;
  } catch {
    return null;
  }
}

const groupsOf = (invites: Record<string, Invite>, athletes: Athlete[], extra: string[] = []) =>
  [...new Set([...Object.keys(invites).filter(Boolean), ...athletes.flatMap(a => a.group ? [a.group] : []), ...extra])];

const toUpdate = (row: cloud.UpdateRow): ProgramUpdate => ({
  id: row.id, at: row.created_at, actions: row.actions, lines: row.lines,
  planId: row.plan_id, planName: row.plan_name, isNew: row.is_new, seenAt: row.seen_at,
});

const byAthlete = <T extends { athleteId: string }>(list: T[]) =>
  list.reduce<Record<string, T[]>>((all, item) => ({ ...all, [item.athleteId]: [...(all[item.athleteId] ?? []), item] }), {});

interface CoachValue extends Omit<CoachData, 'records'> {
  /** The signed-in person as a coach; null while unknown or without the cloud. */
  me: CoachRef | null;
  /** Live: false without the cloud, where nothing of this can work. */
  available: boolean;
  /** The first load is done (or the demo, which has nothing to load). */
  ready: boolean;
  /** The latest failure to read or write, in words, until dismissed. */
  error: string | null;
  clearError: () => void;
  isCoach: boolean;
  summaries: Record<string, AthleteSummary>;
  /** Athletes on a break or not started yet: the number on the Antrenör tab. */
  attentionCount: number;
  /** The athlete's record with every update sent so far applied. */
  athleteState: (id: string) => AppState | null;
  /** From the athlete's last synced record, not the coach's view of it (which has every update applied). */
  updateStatus: (athleteId: string, update: ProgramUpdate) => UpdateStatus;
  /** The same, with the coach's unsent program edits on top. */
  draftState: (id: string) => AppState | null;
  draftDispatch: (athleteId: string, action: AppAction) => void;
  /** What the unsent edits change, in words. */
  draftLines: (athleteId: string) => string[];
  discardDraft: (athleteId: string) => void;
  sendDraft: (athleteId: string) => Promise<boolean>;
  /** False when it could not be sent; the writer keeps the text to try again. */
  addComment: (athleteId: string, comment: NewComment) => Promise<boolean>;
  /** Saves the days of the plan the coach set up for this athlete, unsent edits included. */
  saveTemplate: (athleteId: string, name: string) => Promise<boolean>;
  removeTemplate: (templateId: string) => void;
  /** Sets up the coach's plan for the athlete, empty or from a saved program, as unsent edits. */
  createPlan: (athleteId: string, templateId: string | null) => void;
  removeDay: (athleteId: string, programId: string) => void;
  markSeen: (updateId: string) => void;
  /** The athlete side: start training the plan a coach set up. */
  switchToPlan: (updateId: string) => void;
  /** Who an invite link is from; null for an unknown, expired or renewed link. */
  lookupInvite: (code: string) => Promise<InviteInfo | null>;
  /** Makes sure the group has a working link, making one if needed. */
  ensureInvite: (group: string | null) => void;
  renewInvite: (group: string | null) => void;
  addGroup: (name: string) => void;
  setGroup: (athleteId: string, group: string | null) => void;
  removeAthlete: (athleteId: string) => void;
  acceptInvite: (code: string) => Promise<{ ok: true; coach: string } | { ok: false; message: string }>;
  leaveCoach: (coachId: string) => void;
  reset: () => void;
}

const CoachContext = createContext<CoachValue | null>(null);

const errorText = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch|network|failed to/i.test(message) || !navigator.onLine
    ? 'Bağlantı yok; tekrar dene.'
    : `Olmadı: ${message}`;
};

/** The name others see: the one on the Google account, never the e-mail. */
async function accountName(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const meta = data.session?.user.user_metadata as { full_name?: string; name?: string } | undefined;
  return (meta?.full_name || meta?.name || '').trim().slice(0, 80) || null;
}

export function CoachProvider({ children }: { children: ReactNode }) {
  const app = useContext(AppContext);
  // Read through a ref inside the functions below: the app's value is a new
  // object on every render, and the functions must not change with it.
  const appRef = useRef(app);
  appRef.current = app;
  const userId = DEMO ? null : app?.cloud.userId ?? null;
  const available = DEMO || Boolean(supabase && userId);
  const [data, setData] = useState<CoachData>(() => DEMO ? { ...demoData(), ...readStored(DEMO_KEY) } : emptyData());
  const [ready, setReady] = useState(DEMO);
  const [error, setError] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  // Whose data is in memory: switching accounts must never file one person's under the other.
  const [owner, setOwner] = useState<string | null>(null);
  const me = useMemo<CoachRef | null>(() => DEMO ? { id: DEMO_COACH_ID, name: DEMO_COACH } : userId ? { id: userId, name: myName ?? 'Antrenör' } : null, [userId, myName]);
  const fail = useCallback((reason: unknown) => setError(errorText(reason)), []);

  useEffect(() => {
    if (DEMO || !userId) return;
    void accountName().then(setMyName);
  }, [userId]);

  // Kept on the phone: the demo whole, live everything but the athletes' records,
  // so the gym without signal still shows the coach's notes.
  useEffect(() => {
    const key = DEMO ? DEMO_KEY : userId && owner === userId ? cacheKey(userId) : null;
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify({ ...data, records: {} })); } catch { /* works without it */ }
  }, [data, userId, owner]);

  // One read at a time; asking during one waits for it. A read that ends after
  // a switch of account is dropped.
  const signedIn = useRef(userId);
  signedIn.current = userId;
  const refreshing = useRef<Promise<void> | null>(null);
  const lastRefresh = useRef(0);
  const refresh = useCallback(async (after = false): Promise<void> => {
    if (DEMO || !userId || !supabase) return;
    if (refreshing.current) {
      // A read that started before a change cannot show it: wait, then read again.
      if (!after) return refreshing.current;
      await refreshing.current.catch(() => {});
      return refresh(after);
    }
    lastRefresh.current = Date.now();
    const run = (async () => {
      try {
        const [links, inviteRows] = await Promise.all([cloud.loadLinks(), cloud.loadInvites()]);
        const asCoach = links.filter(link => link.coach_id === userId);
        const asAthlete = links.filter(link => link.athlete_id === userId);
        const invites = Object.fromEntries(inviteRows.map(row => [row.group_name ?? '', { code: row.code, expiresAt: row.expires_at }]));
        const athletes = asCoach.map(link => ({ id: link.athlete_id, name: link.athlete_name, group: link.group_name, joinedAt: link.created_at }));
        const coaches = asAthlete.map(link => ({ id: link.coach_id, name: link.coach_name, since: link.created_at }));
        const coaching = asCoach.length > 0 || inviteRows.length > 0;
        const [records, written, sentRows, library, receivedComments, receivedRows] = await Promise.all([
          asCoach.length ? cloud.loadAthleteStates() : Promise.resolve({}),
          asCoach.length ? cloud.loadComments('coach_id', userId) : Promise.resolve([]),
          asCoach.length ? cloud.loadUpdates('coach_id', userId) : Promise.resolve([]),
          coaching ? cloud.loadTemplates() : Promise.resolve([]),
          asAthlete.length ? cloud.loadComments('athlete_id', userId) : Promise.resolve([]),
          asAthlete.length ? cloud.loadUpdates('athlete_id', userId) : Promise.resolve([]),
        ]);
        // Only what current coaches sent is still theirs to apply.
        const current = new Set(coaches.map(coach => coach.id));
        const sent = Object.fromEntries(athletes.map(athlete => [athlete.id,
          sentRows.filter(row => row.athlete_id === athlete.id).map(toUpdate)]));
        if (signedIn.current !== userId) return;
        setData(d => ({
          ...d,
          athletes, coaches, invites, records, library, sent,
          groups: groupsOf(invites, athletes),
          comments: byAthlete(written),
          inbox: {
            comments: receivedComments,
            updates: receivedRows.filter(row => current.has(row.coach_id))
              .map(row => ({ ...toUpdate(row), coach: row.coach_name, coachId: row.coach_id, seen: row.seen_at !== null })),
          },
          // Unsent edits stay only for athletes still in the team.
          drafts: Object.fromEntries(Object.entries(d.drafts).filter(([id]) => athletes.some(athlete => athlete.id === id))),
        }));
        setError(null);
      } catch (reason) {
        fail(reason);
      } finally {
        refreshing.current = null;
        setReady(true);
      }
    })();
    refreshing.current = run;
    return run;
  }, [userId, fail]);

  // Signed in: what this phone kept first, then the cloud.
  useEffect(() => {
    if (DEMO || !userId) return;
    const cached = readStored(cacheKey(userId));
    setData(cached ? { ...emptyData(), ...cached, records: {} } : emptyData());
    setOwner(userId);
    setReady(Boolean(cached));
    void refresh();
  }, [userId, refresh]);

  useEffect(() => {
    if (DEMO || !userId) return;
    const wake = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > REFRESH_MS) void refresh();
    };
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [userId, refresh]);

  // The athlete side: a coach's program change goes into this person's own
  // record through their own app, once it is in step with the cloud, so it
  // never lands on a stale copy. Each update applies once (appliedCoachUpdates).
  const appState = app?.state;
  const appDispatch = app?.dispatch;
  const inStep = app?.cloud.syncStatus === 'synced' && app.cloud.hydrated;
  const dispatched = useRef(new Set<string>());
  // A group's link being made: opening the invite twice must not make two.
  const renewing = useRef(new Set<string>());
  useEffect(() => {
    if (DEMO || !appState || !appDispatch || !inStep) return;
    const applied = new Set(appState.appliedCoachUpdates ?? []);
    for (const update of data.inbox.updates) {
      if (applied.has(update.id) || dispatched.current.has(update.id)) continue;
      dispatched.current.add(update.id);
      appDispatch({ type: 'APPLY_COACH_UPDATE', payload: { id: update.id, coachId: update.coachId, coachName: update.coach, actions: update.actions } });
    }
  }, [data.inbox.updates, appState, appDispatch, inStep]);

  // Stays the same function while the invites do: the invite page asks once.
  const demoInvites = DEMO ? data.invites : null;
  const lookupInvite = useCallback(async (code: string): Promise<InviteInfo | null> => {
    const clean = code.trim().toUpperCase();
    if (demoInvites) {
      const entry = Object.entries(demoInvites).find(([, invite]) => invite.code === clean);
      return entry ? { coachId: DEMO_COACH_ID, coach: DEMO_COACH, group: entry[0] || null } : null;
    }
    try {
      return await cloud.inviteInfo(clean);
    } catch (reason) {
      fail(reason);
      return null;
    }
  }, [demoInvites, fail]);

  // What the coach sees of each athlete: their record with the updates sent
  // and not yet applied there, applied the way their app will apply them.
  const states = useMemo(() => {
    if (!me) return {} as Record<string, AppState>;
    const now = new Date();
    return Object.fromEntries(data.athletes.map(athlete => {
      const base = DEMO ? demoAthleteState(athlete.id, now) ?? initialState : data.records[athlete.id] ?? initialState;
      const withSent = (data.sent[athlete.id] ?? []).reduce((state, update) =>
        applyCoachUpdate(state, { id: update.id, coachId: me.id, coachName: me.name, actions: update.actions }), base);
      return [athlete.id, withSent];
    })) as Record<string, AppState>;
  }, [me, data.athletes, data.records, data.sent]);

  // The unsent edits on top, through the same gate, so the coach sees what the athlete will get.
  const drafted = useMemo(() => Object.fromEntries(Object.entries(states).map(([id, state]) =>
    [id, data.drafts[id]?.length && me ? applyCoachUpdate(state, { id: 'draft', coachId: me.id, coachName: me.name, actions: data.drafts[id] }) : state])) as Record<string, AppState>,
  [states, data.drafts, me]);

  const summaries = useMemo(() => {
    const now = new Date();
    return Object.fromEntries(Object.entries(states).map(([id, state]) => [id, summarizeAthlete(state, now)])) as Record<string, AthleteSummary>;
  }, [states]);

  const value = useMemo<CoachValue>(() => {
    const coachPlan = (state: AppState | undefined) => state && me ? coachPlanOf(state, me.id).plan : null;
    const describe = (athleteId: string) => {
      const before = states[athleteId];
      const draft = drafted[athleteId];
      const plan = coachPlan(draft);
      if (!before || !draft || !plan) return null;
      const isNew = !coachPlan(before);
      const lines = describeProgramChanges(before, draft, plan.id);
      return { plan, isNew, lines: isNew ? [`Yeni program: ${plan.name}`, ...lines] : lines };
    };
    const addDraft = (athleteId: string, actions: AppAction[]) =>
      setData(d => ({ ...d, drafts: { ...d.drafts, [athleteId]: [...(d.drafts[athleteId] ?? []), ...actions] } }));
    const setInvite = (group: string | null, invite: Invite) =>
      setData(d => {
        const invites = { ...d.invites, [group ?? '']: invite };
        return { ...d, invites, groups: groupsOf(invites, d.athletes, d.groups) };
      });
    const renewInvite = (group: string | null) => {
      if (DEMO) return setInvite(group, { code: newInviteCode().slice(0, 6), expiresAt: far() });
      const key = group ?? '';
      if (!me || renewing.current.has(key)) return;
      renewing.current.add(key);
      void (async () => {
        try {
          await cloud.removeInvites(group);
          const row = await cloud.createInvite(newInviteCode(), me.name, group);
          setInvite(group, { code: row.code, expiresAt: row.expires_at });
        } catch (reason) {
          fail(reason);
        } finally {
          renewing.current.delete(key);
        }
      })();
    };

    return {
      ...data,
      me, available, ready, error,
      clearError: () => setError(null),
      isCoach: data.athletes.length > 0 || Object.keys(data.invites).length > 0,
      summaries,
      attentionCount: Object.values(summaries).filter(summary => needsAttention(summary)).length,
      athleteState: id => states[id] ?? null,
      updateStatus: (athleteId, update) => update.seenAt ? 'seen'
        : data.records[athleteId]?.appliedCoachUpdates?.includes(update.id) ? 'applied' : 'sent',
      draftState: id => drafted[id] ?? null,
      draftDispatch: (athleteId, action) => {
        // Edits only ever reach the plan the coach set up. A new day goes into
        // the plan in use, so the coach's plan is put in use around it.
        const draft = drafted[athleteId];
        const plan = coachPlan(draft);
        if (!draft || !plan) return;
        addDraft(athleteId, action.type === 'ADD_PROGRAM' ? addDayActions(draft, plan.id, action) : [action]);
      },
      draftLines: athleteId => data.drafts[athleteId]?.length ? describe(athleteId)?.lines ?? [] : [],
      discardDraft: athleteId => setData(d => ({ ...d, drafts: { ...d.drafts, [athleteId]: [] } })),
      sendDraft: async athleteId => {
        const actions = data.drafts[athleteId] ?? [];
        const change = describe(athleteId);
        if (!actions.length || !change || !me) return false;
        const fields = { actions, lines: change.lines, planId: change.plan.id, planName: change.plan.name, isNew: change.isNew };
        let update: ProgramUpdate;
        try {
          update = DEMO ? { id: newId(), at: new Date().toISOString(), ...fields } : toUpdate(await cloud.sendUpdate(athleteId, me.name, fields));
        } catch (reason) {
          fail(reason);
          return false;
        }
        setData(d => ({
          ...d,
          // Edits made while it was on its way stay for the next one.
          drafts: { ...d.drafts, [athleteId]: (d.drafts[athleteId] ?? []).slice(actions.length) },
          sent: { ...d.sent, [athleteId]: [...(d.sent[athleteId] ?? []), update] },
        }));
        return true;
      },
      addComment: async (athleteId, comment) => {
        if (!me) return false;
        const draft: CoachComment = { ...comment, id: `yeni-${newId()}`, at: new Date().toISOString(), author: me.name };
        const put = (list: (old: CoachComment[]) => CoachComment[]) =>
          setData(d => ({ ...d, comments: { ...d.comments, [athleteId]: list(d.comments[athleteId] ?? []) } }));
        put(old => [...old, draft]);
        if (DEMO) return true;
        try {
          const saved = await cloud.addComment(athleteId, me.name, comment);
          put(old => old.map(item => item.id === draft.id ? saved : item));
          return true;
        } catch (reason) {
          put(old => old.filter(item => item.id !== draft.id));
          fail(reason);
          return false;
        }
      },
      saveTemplate: async (athleteId, name) => {
        const draft = drafted[athleteId];
        const plan = coachPlan(draft);
        if (!draft || !plan || !name.trim()) return false;
        const template = templateFrom(draft, plan.id, name.trim().slice(0, 80), newId(), new Date().toISOString());
        try {
          const saved = DEMO ? template : await cloud.saveTemplate({ name: template.name, days: template.days });
          setData(d => ({ ...d, library: [saved, ...d.library] }));
          return true;
        } catch (reason) {
          fail(reason);
          return false;
        }
      },
      removeTemplate: templateId => {
        setData(d => ({ ...d, library: d.library.filter(item => item.id !== templateId) }));
        if (!DEMO) cloud.removeTemplate(templateId).catch(fail);
      },
      createPlan: (athleteId, templateId) => {
        const draft = drafted[athleteId];
        const template = templateId ? data.library.find(item => item.id === templateId) ?? null : null;
        if (!draft || !me || coachPlan(draft)) return;
        addDraft(athleteId, newPlanActions(draft, me, template, newId, new Date().toISOString()));
      },
      removeDay: (athleteId, programId) => {
        const draft = drafted[athleteId];
        const plan = coachPlan(draft);
        if (!draft || !plan) return;
        addDraft(athleteId, [{ type: 'UPDATE_PLAN', atWeek: draft.currentWeek, payload: { ...plan, programIds: plan.programIds.filter(id => id !== programId) } }]);
      },
      markSeen: updateId => {
        setData(d => ({ ...d, inbox: { ...d.inbox, updates: d.inbox.updates.map(update => update.id === updateId ? { ...update, seen: true } : update) } }));
        if (!DEMO) cloud.markUpdateSeen(updateId).catch(fail);
      },
      switchToPlan: updateId => {
        const update = data.inbox.updates.find(item => item.id === updateId);
        const app = appRef.current;
        if (app && update) app.dispatch({ type: 'SET_ACTIVE_PLAN', atWeek: app.state.currentWeek, payload: update.planId });
        setData(d => ({ ...d, inbox: { ...d.inbox, updates: d.inbox.updates.map(item => item.id === updateId ? { ...item, seen: true } : item) } }));
        if (!DEMO) cloud.markUpdateSeen(updateId).catch(fail);
      },
      lookupInvite,
      ensureInvite: group => {
        const invite = data.invites[group ?? ''];
        if (!invite || Date.parse(invite.expiresAt) < Date.now() + DAY_MS) renewInvite(group);
      },
      renewInvite,
      addGroup: name => {
        const clean = name.trim().slice(0, 40);
        if (!clean || data.groups.includes(clean)) return;
        setData(d => ({ ...d, groups: [...d.groups, clean] }));
        renewInvite(clean);
      },
      setGroup: (athleteId, group) => {
        setData(d => ({ ...d, athletes: d.athletes.map(a => a.id === athleteId ? { ...a, group } : a) }));
        if (!DEMO && me) cloud.setGroup(me.id, athleteId, group).catch(fail);
      },
      removeAthlete: athleteId => {
        setData(d => ({ ...d, athletes: d.athletes.filter(a => a.id !== athleteId) }));
        if (!DEMO && me) cloud.removeLink(me.id, athleteId).catch(reason => { fail(reason); void refresh(); });
      },
      acceptInvite: async code => {
        const clean = code.trim().toUpperCase();
        if (DEMO) {
          const invite = Object.values(data.invites).some(item => item.code === clean);
          if (!invite || !me) return { ok: false, message: 'Link geçersiz.' };
          if (data.coaches.some(c => c.id === DEMO_COACH_ID)) return { ok: true, coach: DEMO_COACH };
          // Demo: the coach answers at once with a program set up for this
          // person and a note, so the athlete side has something to show. The
          // program goes into their own record the way their app applies it.
          const app = appRef.current;
          const messages = app ? demoCoachMessages(app.state, me) : null;
          const id = newId();
          if (app && messages) app.dispatch({ type: 'APPLY_COACH_UPDATE', payload: { id, coachId: me.id, coachName: me.name, actions: messages.update.actions } });
          setData(d => ({
            ...d,
            coaches: [...d.coaches, { id: DEMO_COACH_ID, name: DEMO_COACH, since: new Date().toISOString() }],
            inbox: messages ? {
              updates: [...d.inbox.updates, { ...messages.update, id, coach: DEMO_COACH, coachId: DEMO_COACH_ID, seen: false }],
              comments: [...d.inbox.comments, ...messages.comments.map(comment => ({ ...comment, id: newId() }))],
            } : d.inbox,
          }));
          return { ok: true, coach: DEMO_COACH };
        }
        if (!me) return { ok: false, message: 'Önce giriş yap.' };
        try {
          // Read now, not from `me`: its fallback is the coach's word, and the
          // name may not have loaded yet. No name at all becomes 'Sporcu' there.
          const joined = await cloud.acceptInvite(clean, (await accountName()) ?? '');
          await refresh(true);
          return { ok: true, coach: joined.coach_name };
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : '';
          return {
            ok: false,
            message: /own invite/.test(message) ? 'Bu senin kendi davet linkin; ekibine katılacak kişiye gönder.'
              : /not found/.test(message) ? 'Bu davet linkinin süresi dolmuş ya da antrenörün linki yenilemiş.'
              : errorText(reason),
          };
        }
      },
      leaveCoach: coachId => {
        setData(d => ({ ...d, coaches: d.coaches.filter(c => c.id !== coachId), inbox: { ...d.inbox, updates: d.inbox.updates.filter(u => u.coachId !== coachId) } }));
        if (!DEMO && me) cloud.removeLink(coachId, me.id).catch(reason => { fail(reason); void refresh(); });
      },
      reset: () => { if (DEMO) setData(demoData()); },
    };
  }, [data, me, available, ready, error, summaries, states, drafted, fail, refresh, lookupInvite]);

  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}

export function useCoach(): CoachValue {
  const value = useContext(CoachContext);
  if (!value) throw new Error('useCoach must be used within CoachProvider');
  return value;
}

/** Days left on an invite, for "6 gün geçerli". */
export const inviteDaysLeft = (invite: Invite | undefined) =>
  invite ? Math.max(0, Math.min(INVITE_DAYS, Math.ceil((Date.parse(invite.expiresAt) - Date.now()) / DAY_MS))) : 0;
