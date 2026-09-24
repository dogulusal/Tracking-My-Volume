import { configurePhaseTransition, initializeProgramVersions, programVersionAt, removeExerciseFromPhase, saveProgramVersion } from '@/utils/programVersions';
import type { AppState, AppAction } from '@/types';
import { CURRENT_DATA_VERSION } from '@/data/migrations';
import { normalizeGoogleSettings } from '@/utils/googleSheetsSettings';
import { startNextPhase } from '@/utils/phases';
import { syncWeekLogFromProgramEdit } from '@/utils/exerciseSync';

export const initialState: AppState = {
  dataVersion: CURRENT_DATA_VERSION,
  programs: [],
  plans: [],
  activePlanId: null,
  weekLogs: [],
  currentWeek: 0,
  phases: [
    { id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: 14 },
    { id: 'phase-2', name: 'Faz 2', startWeek: 15, endWeek: null },
  ],
};

export function appReducer(state: AppState, action: AppAction): AppState {
  if (action.type === 'SET_WEEK' || action.type === 'INCREMENT_WEEK') {
    const week = action.type === 'SET_WEEK' ? action.payload : state.currentWeek + 1;
    if (!Number.isInteger(week) || week < 0) return state;
    const next = { ...initializeProgramVersions(state), currentWeek: week };
    const scope = programVersionAt(next, week);
    const phase = next.phases.find(p => p.id === scope.phaseId);
    if (phase && !next.programVersions!.some(v => v.phaseId === phase.id && v.fromWeek === 0)) return saveProgramVersion(next, phase.startWeek, scope);
    return { ...next, programs: scope.programs, plans: scope.plans, activePlanId: scope.activePlanId };
  }
  if (['ADD_PROGRAM', 'UPDATE_PROGRAM', 'DELETE_PROGRAM', 'ADD_PLAN', 'UPDATE_PLAN', 'DELETE_PLAN', 'SET_ACTIVE_PLAN'].includes(action.type)) {
    const week = ('atWeek' in action ? action.atWeek : undefined) ?? state.currentWeek;
    const scope = programVersionAt(state, week);
    const edited = reduceData({ ...state, programs: scope.programs, plans: scope.plans, activePlanId: scope.activePlanId }, action);
    let saved = saveProgramVersion(state, week, edited);
    // A Phase 3 edit made while browsing an earlier week is still the main
    // program shown on the dashboard at the current week.
    const editedPhase = state.phases.find(p => week >= p.startWeek && (p.endWeek === null || week <= p.endWeek));
    if (action.type === 'UPDATE_PROGRAM' && editedPhase === state.phases[2]
      && state.currentWeek > week && state.currentWeek >= editedPhase.startWeek
      && (editedPhase.endWeek === null || state.currentWeek <= editedPhase.endWeek)) {
      const main = programVersionAt(saved, state.currentWeek);
      const beforeMain = main.programs.find(program => program.id === action.payload.id);
      saved = saveProgramVersion(saved, state.currentWeek, {
        ...main,
        programs: main.programs.map(program => program.id === action.payload.id ? action.payload : program),
      });
      if (action.syncCurrentLog && beforeMain) saved = { ...saved, weekLogs: saved.weekLogs.map(log =>
        log.programId === action.payload.id && log.weekNumber === state.currentWeek
          ? syncWeekLogFromProgramEdit(beforeMain, action.payload, log)
          : log) };
    }
    if (action.type !== 'UPDATE_PROGRAM' || !action.syncCurrentLog) return saved;
    const before = scope.programs.find(program => program.id === action.payload.id);
    if (!before) return saved;
    return { ...saved, weekLogs: saved.weekLogs.map(log =>
      log.programId === action.payload.id && log.weekNumber === week
        ? syncWeekLogFromProgramEdit(before, action.payload, log)
        : log) };
  }
  if (action.type === 'CONFIGURE_PHASE_TRANSITION') {
    return configurePhaseTransition(state, action.payload.previousPhaseId, action.payload.lastWeek, action.payload.nextId);
  }
  if (action.type === 'REMOVE_PHASE_EXERCISE') {
    return removeExerciseFromPhase(state, action.payload.phaseId, action.payload.programId, action.payload.exerciseId);
  }
  if (action.type === 'COPY_PHASE_PROGRAM') {
    return saveProgramVersion(state, action.payload.week, programVersionAt(state, action.payload.sourceWeek));
  }
  if (action.type === 'SET_PHASES') {
    const archived = initializeProgramVersions(state);
    const next = { ...archived, phases: action.payload };
    for (const phase of next.phases) {
      if (!next.programVersions!.some(v => v.phaseId === phase.id)) {
        const source = programVersionAt(archived, Math.max(0, phase.startWeek - 1));
        next.programVersions = [...next.programVersions!, { ...source, phaseId: phase.id, fromWeek: 0 }];
      }
    }
    const current = programVersionAt(next, next.currentWeek);
    return { ...next, programs: current.programs, plans: current.plans, activePlanId: current.activePlanId };
  }
  if (action.type === 'START_NEXT_PHASE') {
    const transition = startNextPhase(state, action.payload.id, action.payload.startAt);
    if (transition === state) return state;
    const next = { ...initializeProgramVersions(state), phases: transition.phases, currentWeek: transition.currentWeek };
    return appReducer(next, { type: 'SET_PHASES', payload: next.phases });
  }
  return reduceData(state, action);
}

function reduceData(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SHEET_MAPPINGS':
      return { ...state, sheetColumnMappings: { ...state.sheetColumnMappings, ...action.payload } };
    case 'START_NEXT_PHASE':
      return startNextPhase(state, action.payload.id, action.payload.startAt);
    case 'CLEAR_HISTORY_DATA': {
      const { programId, weeks, exerciseId, updatedAt } = action.payload;
      return { ...state, weekLogs: state.weekLogs.flatMap(log => {
        if (log.programId !== programId || !weeks.includes(log.weekNumber)) return [log];
        if (exerciseId === undefined) return [];
        return [{ ...log, updatedAt, exercises: log.exercises.filter(ex => ex.exerciseId !== exerciseId) }];
      }) };
    }
    case 'SET_GOOGLE_SHEETS_SETTINGS':
      return { ...state, googleSheetsSettings: normalizeGoogleSettings(action.payload) };
    case 'ADD_PROGRAM': {
      const activePlan = state.plans.find(p => p.id === state.activePlanId) ?? state.plans[0];
      const planId = activePlan?.id ?? crypto.randomUUID();
      return {
        ...state,
        programs: [...state.programs, action.payload],
        activePlanId: planId,
        plans: activePlan
          ? state.plans.map(p => p.id === planId ? { ...p, programIds: [...p.programIds, action.payload.id], updatedAt: action.payload.updatedAt } : p)
          : [{ id: planId, name: 'Varsayılan Plan', programIds: [action.payload.id], createdAt: action.payload.createdAt, updatedAt: action.payload.updatedAt }],
      };
    }

    case 'UPDATE_PROGRAM':
      return {
        ...state,
        programs: state.programs.map(p =>
          p.id === action.payload.id ? action.payload : p
        ),
      };

    case 'DELETE_PROGRAM':
      return {
        ...state,
        programs: state.programs.filter(p => p.id !== action.payload),
        plans: state.plans.map(plan => ({
          ...plan,
          programIds: plan.programIds.filter(id => id !== action.payload),
        })),
      };

    case 'ADD_PLAN':
      return { ...state, plans: [...state.plans, action.payload] };

    case 'UPDATE_PLAN':
      return {
        ...state,
        plans: state.plans.map(p => p.id === action.payload.id ? action.payload : p),
      };

    case 'DELETE_PLAN': {
      const remaining = state.plans.filter(p => p.id !== action.payload);
      return {
        ...state,
        plans: remaining,
        activePlanId: state.activePlanId === action.payload
          ? (remaining[0]?.id ?? null)
          : state.activePlanId,
      };
    }

    case 'SET_ACTIVE_PLAN':
      return { ...state, activePlanId: action.payload };

    case 'SAVE_WORKOUT':
      return { ...state, weekLogs: [...state.weekLogs, action.payload] };

    case 'UPDATE_WORKOUT':
      return {
        ...state,
        weekLogs: state.weekLogs.map(w =>
          w.id === action.payload.id ? action.payload : w
        ),
      };

    case 'DELETE_WORKOUT':
      return {
        ...state,
        weekLogs: state.weekLogs.filter(w => w.id !== action.payload),
      };

    case 'SET_HOLIDAY': {
      const { programId, weekNumber } = action.payload;
      const existing = state.weekLogs.find(
        w => w.programId === programId && w.weekNumber === weekNumber
      );
      if (existing) {
        return {
          ...state,
          weekLogs: state.weekLogs.map(w =>
            w.id === existing.id ? { ...w, isHoliday: !w.isHoliday } : w
          ),
        };
      }
      const newLog: import('@/types').WeekLog = {
        id: crypto.randomUUID(),
        weekNumber,
        programId,
        date: new Date().toISOString().split('T')[0],
        exercises: [],
        notes: '',
        isHoliday: true,
        updatedAt: new Date().toISOString(),
      };
      return { ...state, weekLogs: [...state.weekLogs, newLog] };
    }

    case 'INCREMENT_WEEK':
      return { ...state, currentWeek: state.currentWeek + 1 };

    case 'SET_WEEK':
      return { ...state, currentWeek: action.payload };

    case 'SET_PHASES':
      return { ...state, phases: action.payload };

    case 'SET_STATUS_COLORS':
      return { ...state, statusColors: action.payload };

    case 'SET_EXERCISE_ROW_ORDER':
      return {
        ...state,
        exerciseRowOrder: {
          ...state.exerciseRowOrder,
          [action.payload.programId]: action.payload.exerciseIds,
        },
      };

    case 'IMPORT_DATA':
      return { ...action.payload };

    case 'RESET_DATA':
      return initialState;

    default:
      return state;
  }
}
