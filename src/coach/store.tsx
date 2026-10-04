import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppAction, AppState } from '@/types';
import { AppContext } from '@/context/AppContext';
import { appReducer } from '@/context/appReducer';
import { DEMO_COACH, DEMO_TEMPLATES, demoAthletes, demoAthleteState, type DemoAthlete } from './demo/athletes';
import { activePlanOf, pasteActions, templateFrom, type ProgramTemplate } from './templates';
import { demoCoachMessages } from './demo/coachMessages';
import { needsAttention, summarizeAthlete, type AthleteSummary } from './summary';
import { describeProgramChanges } from './programChanges';
import type { CoachComment, NewComment } from './comments';

// Demo: everything here lives in this browser and starts from made-up
// athletes. Live, the same shape comes from the cloud: the coach's links,
// each athlete's summary, the athlete's full record read-only, and program
// updates the athlete's own app applies to its own record.

export type Athlete = DemoAthlete;
export type { ProgramTemplate };

/** A coach who can see this person's records (the athlete side). */
export interface MyCoach { name: string; since: string }

/**
 * Program changes a coach sent: the same actions the athlete's app would
 * dispatch had they made the change themselves, so earlier weeks keep the
 * program they were trained on.
 */
export interface ProgramUpdate { id: string; at: string; actions: AppAction[]; lines: string[] }
export interface ReceivedUpdate extends ProgramUpdate { coach: string; seen: boolean }

interface CoachData {
  athletes: Athlete[];
  groups: string[];
  /** The current invite code per group ('' = no group). */
  invites: Record<string, string>;
  coaches: MyCoach[];
  /** The coach's own note on each athlete; the athlete never sees it. */
  notes: Record<string, string>;
  /** Coach side, per athlete: comments written, program edits not sent yet, updates sent. */
  comments: Record<string, CoachComment[]>;
  drafts: Record<string, AppAction[]>;
  sent: Record<string, ProgramUpdate[]>;
  /** Athlete side: what this person's coaches sent them. */
  inbox: { updates: ReceivedUpdate[]; comments: CoachComment[] };
  /** The coach's own programs, to copy to anyone. */
  library: ProgramTemplate[];
}

const STORAGE_KEY = 'tmv-antrenor-demo-v1';
const today = () => new Date();
const isoToday = () => today().toISOString().slice(0, 10);
const newId = () => Math.random().toString(36).slice(2, 10);

const initialData = (): CoachData => ({
  athletes: demoAthletes(today()),
  groups: ['Sabah grubu', 'Online'],
  invites: { '': 'K7Q2MD', 'Sabah grubu': 'S4BH9R', Online: 'N8LV3T' },
  coaches: [],
  notes: {
    mert: 'Omuz sakatlığı: bench ve shoulder press hafif kalsın.',
    can: 'Hedef: yılbaşına kadar bench 80 kg.',
  },
  comments: {},
  drafts: {},
  sent: {},
  inbox: { updates: [], comments: [] },
  library: DEMO_TEMPLATES,
});

function load(): CoachData {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<CoachData> | null;
    if (saved && Array.isArray(saved.athletes)) return { ...initialData(), ...saved } as CoachData;
  } catch { /* fall back to the starting data */ }
  return initialData();
}

const applyAll = (state: AppState, actions: AppAction[]) => actions.reduce(appReducer, state);


// Letters that cannot be misread when someone types the code by hand.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');

export const INVITE_DAYS = 7;
export const inviteUrl = (code: string) => `https://dogulusal.github.io/Tracking-My-Volume/katil/${code}`;

interface CoachValue extends CoachData {
  isCoach: boolean;
  summaries: Record<string, AthleteSummary>;
  /** Athletes on a break or not started yet: the number on the Antrenör tab. */
  attentionCount: number;
  setNote: (athleteId: string, text: string) => void;
  /** The athlete's record with every update sent so far applied. */
  athleteState: (id: string) => AppState | null;
  /** The same, with the coach's unsent program edits on top. */
  draftState: (id: string) => AppState | null;
  draftDispatch: (athleteId: string, action: AppAction) => void;
  /** What the unsent edits change, in words. */
  draftLines: (athleteId: string) => string[];
  discardDraft: (athleteId: string) => void;
  sendDraft: (athleteId: string) => void;
  addComment: (athleteId: string, comment: NewComment) => void;
  /** Saves the athlete's current days (unsent edits included) to the library. */
  saveTemplate: (athleteId: string, name: string) => void;
  removeTemplate: (templateId: string) => void;
  /** Copies a library program into the athlete's plan, as unsent edits. */
  pasteTemplate: (athleteId: string, templateId: string, mode: 'replace' | 'add') => void;
  removeDay: (athleteId: string, programId: string) => void;
  markSeen: (updateId: string) => void;
  /** The invite a code belongs to, or null for an unknown or renewed link. */
  inviteFor: (code: string) => { coach: string; group: string | null } | null;
  renewInvite: (group: string | null) => void;
  addGroup: (name: string) => void;
  setGroup: (athleteId: string, group: string | null) => void;
  removeAthlete: (athleteId: string) => void;
  acceptInvite: (code: string) => void;
  leaveCoach: (name: string) => void;
  reset: () => void;
}

const CoachContext = createContext<CoachValue | null>(null);

export function CoachProvider({ children }: { children: ReactNode }) {
  const app = useContext(AppContext);
  const [data, setData] = useState<CoachData>(load);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* the demo works without it */ }
  }, [data]);

  const inviteFor = useCallback((code: string) => {
    const entry = Object.entries(data.invites).find(([, value]) => value === code.toUpperCase());
    return entry ? { coach: DEMO_COACH, group: entry[0] || null } : null;
  }, [data.invites]);

  // In the demo a sent update reaches the athlete at once; live, when their app next opens.
  const states = useMemo(() => {
    const now = today();
    return Object.fromEntries(data.athletes.flatMap(athlete => {
      const base = demoAthleteState(athlete.id, now);
      return base ? [[athlete.id, applyAll(base, (data.sent[athlete.id] ?? []).flatMap(update => update.actions))]] : [];
    })) as Record<string, AppState>;
  }, [data.athletes, data.sent]);

  const drafted = useMemo(() => Object.fromEntries(Object.entries(states).map(([id, state]) =>
    [id, data.drafts[id]?.length ? applyAll(state, data.drafts[id]) : state])) as Record<string, AppState>,
  [states, data.drafts]);

  const summaries = useMemo(() => {
    const now = today();
    return Object.fromEntries(Object.entries(states).map(([id, state]) => [id, summarizeAthlete(state, now)])) as Record<string, AthleteSummary>;
  }, [states]);

  const value = useMemo<CoachValue>(() => ({
    ...data,
    isCoach: data.athletes.length > 0,
    summaries,
    attentionCount: Object.values(summaries).filter(summary => needsAttention(summary)).length,
    setNote: (athleteId, text) => setData(d => ({ ...d, notes: { ...d.notes, [athleteId]: text.trim() } })),
    athleteState: id => states[id] ?? null,
    draftState: id => drafted[id] ?? null,
    draftDispatch: (athleteId, action) => {
      // A first day for someone with no plan: the plan is made here with a
      // fixed id, or every replay of the edits would make another one.
      const draft = drafted[athleteId];
      const planId = `plan_${newId()}`;
      const actions: AppAction[] = action.type === 'ADD_PROGRAM' && draft && !activePlanOf(draft).plan ? [
        { type: 'ADD_PLAN', atWeek: draft.currentWeek, payload: { id: planId, name: 'Program', programIds: [], createdAt: action.payload.createdAt, updatedAt: action.payload.updatedAt } },
        { type: 'SET_ACTIVE_PLAN', atWeek: draft.currentWeek, payload: planId },
        action,
      ] : [action];
      setData(d => ({ ...d, drafts: { ...d.drafts, [athleteId]: [...(d.drafts[athleteId] ?? []), ...actions] } }));
    },
    draftLines: athleteId => states[athleteId] && drafted[athleteId] ? describeProgramChanges(states[athleteId], drafted[athleteId]) : [],
    discardDraft: athleteId => setData(d => ({ ...d, drafts: { ...d.drafts, [athleteId]: [] } })),
    sendDraft: athleteId => {
      const draft = drafted[athleteId];
      const lines = states[athleteId] && draft ? describeProgramChanges(states[athleteId], draft) : [];
      let actions = data.drafts[athleteId] ?? [];
      if (!actions.length || !draft) return;
      // The first update makes the plan the coach's to manage; the athlete's
      // own plans stay theirs.
      const { plan } = activePlanOf(draft);
      if (plan && !plan.coach) actions = [...actions, { type: 'UPDATE_PLAN', atWeek: draft.currentWeek, payload: { ...plan, coach: DEMO_COACH } }];
      const update: ProgramUpdate = { id: newId(), at: new Date().toISOString(), actions, lines };
      setData(d => ({ ...d, drafts: { ...d.drafts, [athleteId]: [] }, sent: { ...d.sent, [athleteId]: [...(d.sent[athleteId] ?? []), update] } }));
    },
    addComment: (athleteId, comment) => setData(d => ({ ...d, comments: {
      ...d.comments,
      [athleteId]: [...(d.comments[athleteId] ?? []), { ...comment, id: newId(), at: new Date().toISOString(), author: DEMO_COACH }],
    } })),
    saveTemplate: (athleteId, name) => {
      const draft = drafted[athleteId];
      if (!draft || !name.trim()) return;
      const template = templateFrom(draft, name.trim(), newId(), new Date().toISOString());
      setData(d => ({ ...d, library: [template, ...d.library] }));
    },
    removeTemplate: templateId => setData(d => ({ ...d, library: d.library.filter(item => item.id !== templateId) })),
    pasteTemplate: (athleteId, templateId, mode) => {
      const draft = drafted[athleteId];
      const template = data.library.find(item => item.id === templateId);
      if (!draft || !template) return;
      const actions = pasteActions(draft, template, mode, newId, new Date().toISOString());
      setData(d => ({ ...d, drafts: { ...d.drafts, [athleteId]: [...(d.drafts[athleteId] ?? []), ...actions] } }));
    },
    removeDay: (athleteId, programId) => {
      const draft = drafted[athleteId];
      const plan = draft ? activePlanOf(draft).plan : null;
      if (!draft || !plan) return;
      const action: AppAction = { type: 'UPDATE_PLAN', atWeek: draft.currentWeek, payload: { ...plan, programIds: plan.programIds.filter(id => id !== programId) } };
      setData(d => ({ ...d, drafts: { ...d.drafts, [athleteId]: [...(d.drafts[athleteId] ?? []), action] } }));
    },
    markSeen: updateId => setData(d => ({ ...d, inbox: { ...d.inbox, updates: d.inbox.updates.map(update => update.id === updateId ? { ...update, seen: true } : update) } })),
    inviteFor,
    renewInvite: group => setData(d => ({ ...d, invites: { ...d.invites, [group ?? '']: newCode() } })),
    addGroup: name => setData(d => {
      const clean = name.trim();
      if (!clean || d.groups.includes(clean)) return d;
      return { ...d, groups: [...d.groups, clean], invites: { ...d.invites, [clean]: newCode() } };
    }),
    setGroup: (athleteId, group) => setData(d => ({ ...d, athletes: d.athletes.map(a => a.id === athleteId ? { ...a, group } : a) })),
    removeAthlete: athleteId => setData(d => ({ ...d, athletes: d.athletes.filter(a => a.id !== athleteId) })),
    acceptInvite: code => {
      if (!inviteFor(code) || data.coaches.some(c => c.name === DEMO_COACH)) return;
      // Demo: the coach answers at once with a program change and a comment,
      // so the athlete side has something to show. The change goes through
      // this person's own record, the way their app would apply it.
      const messages = app ? demoCoachMessages(app.state, DEMO_COACH) : null;
      if (app && messages) messages.update.actions.forEach(action => app.dispatch(action));
      setData(d => ({
        ...d,
        coaches: [...d.coaches, { name: DEMO_COACH, since: isoToday() }],
        inbox: messages ? {
          updates: [...d.inbox.updates, { ...messages.update, id: newId(), coach: DEMO_COACH, seen: false }],
          comments: [...d.inbox.comments, ...messages.comments.map(comment => ({ ...comment, id: newId() }))],
        } : d.inbox,
      }));
    },
    leaveCoach: name => setData(d => ({ ...d, coaches: d.coaches.filter(c => c.name !== name) })),
    reset: () => setData(initialData()),
  }), [data, inviteFor, summaries, states, drafted, app]);

  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}

export function useCoach(): CoachValue {
  const value = useContext(CoachContext);
  if (!value) throw new Error('useCoach must be used within CoachProvider');
  return value;
}

const MONTHS_FROM = ['Ocak\'tan', 'Şubat\'tan', 'Mart\'tan', 'Nisan\'dan', 'Mayıs\'tan', 'Haziran\'dan', 'Temmuz\'dan', 'Ağustos\'tan', 'Eylül\'den', 'Ekim\'den', 'Kasım\'dan', 'Aralık\'tan'];

/** "4 Ekim'den beri", with the suffix the month takes. */
export function sinceText(isoDate: string): string {
  const [, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS_FROM[month - 1]} beri`;
}

/** "Elif'in", "Can'ın", "Ece'nin": the genitive, by the name's last vowel. */
export function possessive(name: string): string {
  const vowels = name.toLocaleLowerCase('tr-TR').match(/[aıoueiöü]/g);
  const last = vowels?.[vowels.length - 1] ?? 'e';
  const suffix = 'aı'.includes(last) ? 'ın' : 'ou'.includes(last) ? 'un' : 'öü'.includes(last) ? 'ün' : 'in';
  return /[aıoueiöü]$/i.test(name) ? `${name}'n${suffix}` : `${name}'${suffix}`;
}
