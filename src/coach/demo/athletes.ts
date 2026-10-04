import { initialState } from '@/context/appReducer';
import type { AppState, Intensity, Program, WeekLog } from '@/types';
import type { ProgramTemplate } from '../templates';

// Demo only: made-up athletes, each showing one situation a coach meets.
// Dates are counted back from the day the demo is opened, so "dün" stays
// yesterday. Deterministic: every phone sees the same numbers.

type Move = [name: string, weight: number, step: number];
type Day = { name: string; moves: Move[] };

const BENCH: Move = ['Bench Press', 60, 2.5];
const ROW: Move = ['Cable Row', 50, 2.5];
const OHP: Move = ['Shoulder Press', 20, 2];
const PULLDOWN: Move = ['Lat Pulldown', 55, 2.5];
const CURL: Move = ['Biceps Curl', 12, 1];
const PUSHDOWN: Move = ['Triceps Pushdown', 25, 2.5];
const LATERAL: Move = ['Lateral Raise', 8, 1];
const INCLINE: Move = ['Incline Dumbbell Press', 22, 2];
const FACEPULL: Move = ['Face Pull', 20, 2.5];
const SQUAT: Move = ['Squat', 80, 2.5];
const RDL: Move = ['Romanian Deadlift', 70, 2.5];
const LEGPRESS: Move = ['Leg Press', 140, 5];
const LEGCURL: Move = ['Leg Curl', 40, 2.5];
const CALF: Move = ['Calf Raise', 60, 5];

const UPPER_LOWER: Day[] = [
  { name: 'Üst A', moves: [BENCH, ROW, OHP, CURL] },
  { name: 'Alt A', moves: [SQUAT, LEGCURL, CALF] },
  { name: 'Üst B', moves: [INCLINE, PULLDOWN, LATERAL, PUSHDOWN] },
  { name: 'Alt B', moves: [RDL, LEGPRESS, CALF] },
];
const FULL_BODY: Day[] = [
  { name: 'Tüm vücut A', moves: [SQUAT, BENCH, ROW, LATERAL] },
  { name: 'Tüm vücut B', moves: [RDL, OHP, PULLDOWN, CURL] },
  { name: 'Tüm vücut C', moves: [LEGPRESS, INCLINE, FACEPULL, PUSHDOWN] },
];
const PPL: Day[] = [
  { name: 'İtiş', moves: [BENCH, INCLINE, OHP, LATERAL, PUSHDOWN] },
  { name: 'Çekiş', moves: [PULLDOWN, ROW, FACEPULL, CURL] },
  { name: 'Bacak', moves: [SQUAT, LEGPRESS, LEGCURL, CALF] },
];

const templateOf = (id: string, name: string, days: Day[], reps: number): ProgramTemplate => ({
  id, name, savedAt: '2026-09-01T09:00:00.000Z',
  days: days.map(day => ({ name: day.name, exercises: day.moves.map(([move]) => ({ name: move, defaultSets: 3, defaultReps: reps, defaultWeight: 0 })) })),
});

/** The demo coach's library to start with. */
export const DEMO_TEMPLATES: ProgramTemplate[] = [
  templateOf('ust-alt', 'Üst/Alt · 4 gün', UPPER_LOWER, 10),
  templateOf('tum-vucut', 'Tüm vücut · 3 gün (başlangıç)', FULL_BODY, 12),
  templateOf('itis-cekis', 'İtiş/Çekiş/Bacak · 3 gün', PPL, 10),
];

// Days of the week each split trains on, counted from its first day.
const OFFSETS: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4] };

interface Profile {
  id: string;
  name: string;
  group: string | null;
  joinedDaysAgo: number;
  days: Day[];
  /** The athlete's current week; 0 = the first. */
  week: number;
  doneThisWeek: number;
  /** Days since the latest workout. */
  lastAgo: number;
  /** Workouts done in the week before the current one, when it was cut short. */
  lastWeekDone?: number;
  /** How often a set gains a rep (0–1). */
  pace: number;
  /** Movements that stopped improving this many weeks ago. */
  stuck?: { names: string[]; weeks: number };
  /** Week notes, by weeks back from the current one, on that week's first day. */
  notes?: Record<number, string>;
  /** A note left on a movement, by weeks back. */
  moveNotes?: Record<number, [move: string, note: string]>;
  /** The plan was set up by the coach; otherwise it is the athlete's own. */
  coachPlan?: boolean;
}

const PROFILES: Profile[] = [
  {
    id: 'elif', name: 'Elif Kaya', group: 'Sabah grubu', joinedDaysAgo: 41, days: UPPER_LOWER, week: 8,
    doneThisWeek: 2, lastAgo: 1, pace: 0.7,
    moveNotes: { 0: ['Squat', 'Derinlik iyi, bir dahakine 2.5 kg ekle.'] },
  },
  {
    id: 'mert', name: 'Mert Aydın', group: 'Sabah grubu', joinedDaysAgo: 63, days: FULL_BODY, week: 11,
    doneThisWeek: 0, lastAgo: 9, pace: 0.5, coachPlan: true,
    notes: { 1: 'Omzum ağrıyordu, bench\'i hafif tuttum.' },
  },
  {
    id: 'zeynep', name: 'Zeynep Demir', group: 'Online', joinedDaysAgo: 30, days: PPL, week: 6,
    doneThisWeek: 3, lastAgo: 0, pace: 0.8, coachPlan: true,
    notes: { 0: 'Bu hafta çok iyi hissettim.' },
  },
  {
    id: 'can', name: 'Can Yıldız', group: 'Online', joinedDaysAgo: 96, days: UPPER_LOWER, week: 15,
    doneThisWeek: 1, lastAgo: 2, pace: 0.45, coachPlan: true,
    stuck: { names: ['Bench Press', 'Squat', 'Cable Row'], weeks: 6 },
    notes: { 2: 'Bench\'te 80\'i geçemiyorum, uyku az.' },
  },
  {
    id: 'deniz', name: 'Deniz Öztürk', group: null, joinedDaysAgo: 3, days: FULL_BODY.slice(0, 2), week: 0,
    doneThisWeek: 1, lastAgo: 1, pace: 0.6,
  },
  {
    id: 'burak', name: 'Burak Şahin', group: 'Sabah grubu', joinedDaysAgo: 52, days: FULL_BODY, week: 6,
    doneThisWeek: 0, lastAgo: 13, lastWeekDone: 1, pace: 0.55,
  },
  {
    id: 'ece', name: 'Ece Arslan', group: null, joinedDaysAgo: 0, days: [], week: 0,
    doneThisWeek: 0, lastAgo: 0, pace: 0,
  },
];

export interface DemoAthlete {
  id: string;
  name: string;
  group: string | null;
  joinedAt: string;
}

const DAY_MS = 86400000;
const isoDay = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function demoAthletes(today = new Date()): DemoAthlete[] {
  return PROFILES.map(profile => ({
    id: profile.id, name: profile.name, group: profile.group,
    joinedAt: isoDay(today.getTime() - profile.joinedDaysAgo * DAY_MS),
  }));
}

function buildState(profile: Profile, today: Date): AppState {
  const created = new Date(today.getTime() - profile.joinedDaysAgo * DAY_MS).toISOString();
  const programs: Program[] = profile.days.map((day, dayIndex) => ({
    id: `${profile.id}-d${dayIndex}`,
    name: day.name,
    order: dayIndex + 1,
    createdAt: created,
    updatedAt: created,
    exercises: day.moves.map(([name, weight], moveIndex) => ({
      id: `${profile.id}-d${dayIndex}-m${moveIndex}`, name, defaultSets: 3, defaultWeight: weight, defaultReps: 8, isActive: true,
    })),
  }));
  if (!programs.length) return { ...initialState, currentWeek: profile.week };

  const offsets = OFFSETS[profile.days.length] ?? profile.days.map((_, i) => i);
  const done = (week: number) => week === profile.week ? profile.doneThisWeek
    : week === profile.week - 1 && profile.lastWeekDone !== undefined ? profile.lastWeekDone : profile.days.length;
  // The latest workout fixes the calendar: it was lastAgo days ago.
  const anchorWeek = profile.doneThisWeek > 0 ? profile.week : profile.week - 1;
  const anchorDay = done(anchorWeek) - 1;
  const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  const weekStart = (week: number) => todayNoon - (profile.lastAgo + offsets[anchorDay]) * DAY_MS + (week - anchorWeek) * 7 * DAY_MS;

  let seed = profile.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 7);
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  // Top set of each movement, carried from session to session (8–12 reps, then more weight).
  const top = new Map<string, { weight: number; reps: number }>();
  const stuckFrom = profile.stuck ? profile.week - profile.stuck.weeks : Infinity;

  const weekLogs: WeekLog[] = [];
  for (let week = 0; week <= profile.week; week++) {
    for (let dayIndex = 0; dayIndex < done(week); dayIndex++) {
      const day = profile.days[dayIndex];
      const program = programs[dayIndex];
      const date = isoDay(weekStart(week) + offsets[dayIndex] * DAY_MS);
      const back = profile.week - week;
      const exercises = day.moves.map(([name, weight, step], moveIndex) => {
        const key = `${dayIndex}:${name}`;
        const current = top.get(key) ?? { weight, reps: 8 };
        const stuck = profile.stuck?.names.includes(name) && week >= stuckFrom;
        if (top.has(key) && !stuck) {
          const roll = random();
          if (roll < profile.pace) current.reps += 1;
          else if (roll > 0.9) current.reps -= 1;
          if (current.reps > 12) { current.weight += step; current.reps = 8; }
          current.reps = Math.max(6, current.reps);
        }
        top.set(key, current);
        const note = profile.moveNotes?.[back];
        return {
          exerciseId: program.exercises[moveIndex].id,
          exerciseName: name,
          sets: [0, 1, 2].map(setIndex => ({
            weight: current.weight,
            reps: Math.max(5, current.reps - setIndex),
            intensity: (['rir2', 'rir1', 'failure'] as Intensity[])[setIndex],
          })),
          ...(note && note[0] === name && dayIndex === dayOf(profile, name) ? { note: note[1] } : {}),
        };
      });
      weekLogs.push({
        id: `${program.id}-w${week}`,
        weekNumber: week,
        programId: program.id,
        date,
        exercises,
        notes: dayIndex === 0 ? profile.notes?.[back] ?? '' : '',
        isHoliday: false,
        updatedAt: new Date(weekStart(week) + offsets[dayIndex] * DAY_MS).toISOString(),
      });
    }
  }

  return {
    ...initialState,
    programs,
    plans: [{
      id: `${profile.id}-plan`, programIds: programs.map(p => p.id), createdAt: created, updatedAt: created,
      ...(profile.coachPlan ? { name: 'Antrenör programı', coach: DEMO_COACH } : { name: 'Varsayılan Plan' }),
    }],
    activePlanId: `${profile.id}-plan`,
    weekLogs,
    currentWeek: profile.week,
  };
}

const dayOf = (profile: Profile, move: string) => profile.days.findIndex(day => day.moves.some(([name]) => name === move));

const cache = new Map<string, AppState>();

/** The athlete's whole record, as their own app holds it. */
export function demoAthleteState(id: string, today = new Date()): AppState | null {
  const profile = PROFILES.find(item => item.id === id);
  if (!profile) return null;
  const key = `${id}:${isoDay(today.getTime())}`;
  if (!cache.has(key)) cache.set(key, buildState(profile, today));
  return cache.get(key)!;
}

/** The coach the athlete side of the demo is invited by. */
export const DEMO_COACH = 'Ahmet Yılmaz';
export const DEMO_INVITE_CODE = 'K7Q2MD';
