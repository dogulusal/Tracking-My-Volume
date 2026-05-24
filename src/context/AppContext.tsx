import { createContext, useReducer, useEffect, type ReactNode } from 'react';
import type { AppState, AppAction } from '@/types';
import { appReducer, initialState } from './appReducer';
import { generatePdfImportData } from '@/data/pdfImportData';

const STORAGE_KEY = 'workout-tracker';
// Increment this when data structure changes that need migration
const CURRENT_DATA_VERSION = 5;

export interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

export const AppContext = createContext<AppContextValue | null>(null);

function cleanOrphanDrafts(programs: AppState['programs']) {
  const validIds = programs.map(p => p.id);
  Object.keys(localStorage)
    .filter(k => k.startsWith('draft-'))
    .filter(k => !validIds.some(id => k.includes(id)))
    .forEach(k => localStorage.removeItem(k));
}

// Apply data migrations when loading old localStorage data
function applyMigrations(state: AppState): AppState {
  const version = state.dataVersion ?? 1;
  if (version >= CURRENT_DATA_VERSION) return state;

  let s = { ...state, weekLogs: [...state.weekLogs] };

  if (version < 2) {
    // v2: Fix upper1 week 10 → holiday "bayram"; move note to week 11
    s.weekLogs = s.weekLogs.map(log => {
      if (log.programId === 'upper1' && log.weekNumber === 10) {
        return { ...log, exercises: [], isHoliday: true, notes: 'bayram' };
      }
      if (log.programId === 'upper1' && log.weekNumber === 11) {
        return {
          ...log,
          notes: log.notes || 'long ve tricepsleri solla başla önce ve long bicepsi de değiş',
        };
      }
      return log;
    });
  }

  if (version < 3) {
    // v3: Add full Lower1 week 19 data; fix week 18 (H3) hack_squat typo
    const lower1W18 = s.weekLogs.find(log => log.programId === 'lower1' && log.weekNumber === 18);
    if (lower1W18) {
      // Fix week 18 hack_squat to use correct weight prefix in second set
      const fixed18 = lower1W18.exercises.map(ex => ex.exerciseId === 'l1_hack_squat'
        ? { ...ex, sets: ex.sets.map((st, i) => i === 1 ? { ...st, weight: 75 } : st) }
        : ex
      );
      s.weekLogs = s.weekLogs.map(log =>
        log.programId === 'lower1' && log.weekNumber === 18 ? { ...lower1W18, exercises: fixed18 } : log
      );
    }

    const lower1W19 = s.weekLogs.find(log => log.programId === 'lower1' && log.weekNumber === 19);
    const w19Exercises = [
      { exerciseId: 'l1_adduction', exerciseName: 'Adduction Machine', sets: [{ weight: 25, reps: 13, intensity: 'failure' as const }, { weight: 25, reps: 11, intensity: 'failure' as const }] },
      { exerciseId: 'l1_leg_ext',  exerciseName: 'Leg Extension',      sets: [{ weight: 11.25, reps: 10, intensity: 'failure' as const }] },
      { exerciseId: 'l1_leg_curl', exerciseName: 'Leg Curl',           sets: [{ weight: 77.5, reps: 9, intensity: 'failure' as const }, { weight: 77.5, reps: 8, intensity: 'failure' as const }] },
      { exerciseId: 'l1_hack_squat', exerciseName: 'Hack Squat',       sets: [{ weight: 75, reps: 9, intensity: 'failure' as const }, { weight: 75, reps: 10, intensity: 'rir1' as const }] },
      { exerciseId: 'l1_kalf',     exerciseName: 'Kalf',               sets: [{ weight: 110, reps: 15, intensity: 'failure' as const }, { weight: 110, reps: 12, intensity: 'failure' as const }] },
    ];
    if (lower1W19) {
      s.weekLogs = s.weekLogs.map(log =>
        log.programId === 'lower1' && log.weekNumber === 19
          ? { ...lower1W19, exercises: w19Exercises, notes: lower1W19.notes || 'leg extensionda 1.25 daha ekle' }
          : log
      );
    } else {
      s.weekLogs.push({
        id: `lower1_w19`,
        weekNumber: 19,
        programId: 'lower1',
        date: '2025-01-26',
        exercises: w19Exercises,
        notes: 'leg extensionda 1.25 daha ekle',
        isHoliday: false,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  if (version < 4) {
    // v4: Introduce Plan layer — group all existing programs into a default plan
    if (!s.plans || s.plans.length === 0) {
      const now = new Date().toISOString();
      const defaultPlan: import('@/types').Plan = {
        id: crypto.randomUUID(),
        name: 'Varsayılan Plan',
        programIds: s.programs.map(p => p.id),
        createdAt: now,
        updatedAt: now,
      };
      s = { ...s, plans: [defaultPlan], activePlanId: defaultPlan.id };
    }
  }

  if (version < 5) {
    // v5: Add phases array if missing
    if (!s.phases || s.phases.length === 0) {
      s = {
        ...s,
        phases: [
          { id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: 14 },
          { id: 'phase-2', name: 'Faz 2', startWeek: 15, endWeek: null },
        ],
      };
    }
  }

  return { ...s, dataVersion: CURRENT_DATA_VERSION };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppState;
        if (parsed.programs && parsed.programs.length > 0) {
          cleanOrphanDrafts(parsed.programs);
          // Run migrations if data is from an older version
          return applyMigrations(parsed);
        }
      }
    } catch {
      // corrupted data — start fresh
    }
    // No saved data → load PDF data as starting point (one-time only)
    try {
      const freshData = generatePdfImportData();
      const now = new Date().toISOString();
      const defaultPlan: import('@/types').Plan = {
        id: crypto.randomUUID(),
        name: 'Varsayılan Plan',
        programIds: freshData.programs.map(p => p.id),
        createdAt: now,
        updatedAt: now,
      };
      return { ...freshData, plans: [defaultPlan], activePlanId: defaultPlan.id, phases: initialState.phases, dataVersion: CURRENT_DATA_VERSION };
    } catch {
      return initialState;
    }
  });

  // Auto-save to localStorage on every state change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}
