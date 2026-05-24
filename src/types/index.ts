// ─── Intensity & Status Enums ─────────────────────────

export type Intensity = 'failure' | 'rir1' | 'rir2' | 'rir3';

export type ExerciseStatus = 'improved' | 'decreased' | 'same' | 'holiday' | 'removed' | 'new';

// ─── Plan ─────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;
  programIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Exercise & Program ───────────────────────────────

export interface ExerciseDefinition {
  id: string;
  name: string;
  defaultSets: number;
  defaultWeight: number;
  defaultReps: number;
  isActive: boolean;
}

export interface Program {
  id: string;
  name: string;
  order: number;
  exercises: ExerciseDefinition[];
  createdAt: string;
  updatedAt: string;
}

// ─── Workout Logging ──────────────────────────────────

export interface SetLog {
  weight: number;
  reps: number;
  intensity: Intensity;
}

export interface ExerciseLog {
  exerciseId: string;
  exerciseName: string;
  sets: SetLog[];
}

export interface WeekLog {
  id: string;
  weekNumber: number;
  programId: string;
  date: string;
  exercises: ExerciseLog[];
  notes: string;
  isHoliday: boolean;
  updatedAt: string;
}

// ─── Phase Definitions ────────────────────────────────

export interface PhaseDefinition {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number | null; // null = open-ended (current phase)
}

// ─── App State ────────────────────────────────────────

export interface AppState {
  programs: Program[];
  plans: Plan[];
  activePlanId: string | null;
  weekLogs: WeekLog[];
  currentWeek: number;
  phases: PhaseDefinition[];
  dataVersion?: number;
}

// ─── Reducer Actions ──────────────────────────────────

export type AppAction =
  | { type: 'ADD_PROGRAM'; payload: Program }
  | { type: 'UPDATE_PROGRAM'; payload: Program }
  | { type: 'DELETE_PROGRAM'; payload: string }
  | { type: 'ADD_PLAN'; payload: Plan }
  | { type: 'UPDATE_PLAN'; payload: Plan }
  | { type: 'DELETE_PLAN'; payload: string }
  | { type: 'SET_ACTIVE_PLAN'; payload: string }
  | { type: 'SAVE_WORKOUT'; payload: WeekLog }
  | { type: 'UPDATE_WORKOUT'; payload: WeekLog }
  | { type: 'DELETE_WORKOUT'; payload: string }
  | { type: 'SET_HOLIDAY'; payload: { programId: string; weekNumber: number } }
  | { type: 'INCREMENT_WEEK' }
  | { type: 'SET_WEEK'; payload: number }
  | { type: 'SET_PHASES'; payload: PhaseDefinition[] }
  | { type: 'IMPORT_DATA'; payload: AppState }
  | { type: 'RESET_DATA' };

// ─── Export Format ────────────────────────────────────

export interface ExportData {
  exportDate: string;
  version: string;
  programs: Program[];
  plans: Plan[];
  activePlanId: string | null;
  weekLogs: WeekLog[];
  currentWeek: number;
  phases?: PhaseDefinition[];
}
