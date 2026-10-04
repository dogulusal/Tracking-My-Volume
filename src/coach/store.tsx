import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppState } from '@/types';
import { DEMO_COACH, demoAthletes, demoAthleteState, type DemoAthlete } from './demo/athletes';
import { needsAttention, summarizeAthlete, type AthleteSummary } from './summary';

// Demo: everything here lives in this browser and starts from made-up
// athletes. Live, the same shape comes from the cloud: the coach's links,
// each athlete's summary, and the athlete's full record read-only.

export type Athlete = DemoAthlete;

/** A coach who can see this person's records (the athlete side). */
export interface MyCoach { name: string; since: string }

interface CoachData {
  athletes: Athlete[];
  groups: string[];
  /** The current invite code per group ('' = no group). */
  invites: Record<string, string>;
  coaches: MyCoach[];
  /** The coach's own note on each athlete; the athlete never sees it. */
  notes: Record<string, string>;
}

const STORAGE_KEY = 'tmv-antrenor-demo-v1';
const today = () => new Date();
const isoToday = () => today().toISOString().slice(0, 10);

const initialData = (): CoachData => ({
  athletes: demoAthletes(today()),
  groups: ['Sabah grubu', 'Online'],
  invites: { '': 'K7Q2MD', 'Sabah grubu': 'S4BH9R', Online: 'N8LV3T' },
  coaches: [],
  notes: {
    mert: 'Omuz sakatlığı: bench ve shoulder press hafif kalsın.',
    can: 'Hedef: yılbaşına kadar bench 80 kg.',
  },
});

function load(): CoachData {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as CoachData | null;
    if (saved && Array.isArray(saved.athletes)) return { ...saved, notes: saved.notes ?? {} };
  } catch { /* fall back to the starting data */ }
  return initialData();
}

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
  athleteState: (id: string) => AppState | null;
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
  const [data, setData] = useState<CoachData>(load);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* the demo works without it */ }
  }, [data]);

  const inviteFor = useCallback((code: string) => {
    const entry = Object.entries(data.invites).find(([, value]) => value === code.toUpperCase());
    return entry ? { coach: DEMO_COACH, group: entry[0] || null } : null;
  }, [data.invites]);

  const summaries = useMemo(() => {
    const now = today();
    return Object.fromEntries(data.athletes.flatMap(athlete => {
      const state = demoAthleteState(athlete.id, now);
      return state ? [[athlete.id, summarizeAthlete(state, now)]] : [];
    })) as Record<string, AthleteSummary>;
  }, [data.athletes]);

  const value = useMemo<CoachValue>(() => ({
    ...data,
    isCoach: data.athletes.length > 0,
    summaries,
    attentionCount: Object.values(summaries).filter(summary => needsAttention(summary)).length,
    setNote: (athleteId, text) => setData(d => ({ ...d, notes: { ...d.notes, [athleteId]: text.trim() } })),
    athleteState: id => demoAthleteState(id, today()) ?? null,
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
      if (!inviteFor(code)) return;
      setData(d => d.coaches.some(c => c.name === DEMO_COACH) ? d : { ...d, coaches: [...d.coaches, { name: DEMO_COACH, since: isoToday() }] });
    },
    leaveCoach: name => setData(d => ({ ...d, coaches: d.coaches.filter(c => c.name !== name) })),
    reset: () => setData(initialData()),
  }), [data, inviteFor, summaries]);

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
