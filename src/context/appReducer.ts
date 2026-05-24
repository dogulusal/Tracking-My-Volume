import type { AppState, AppAction } from '@/types';

export const initialState: AppState = {
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
  switch (action.type) {
    case 'ADD_PROGRAM':
      return { ...state, programs: [...state.programs, action.payload] };

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

    case 'IMPORT_DATA':
      return { ...action.payload };

    case 'RESET_DATA':
      return initialState;

    default:
      return state;
  }
}
