// ─── Intensity & Status Enums ─────────────────────────

export type Intensity = 'failure' | 'rir1' | 'rir2' | 'rir3';

export type ExerciseStatus = 'improved' | 'decreased' | 'same' | 'holiday' | 'removed' | 'new';

// ─── Plan ─────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;
  programIds: string[];
  // The coach who manages this plan, by name and by account; absent on the
  // person's own plans, which a coach can see but not change.
  coach?: string;
  coachId?: string;
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
  // What this session of the movement left for the next one ("50 kilo gir").
  note?: string;
}

/**
 * Settings that belong to a movement, not to one program: the same machine
 * keeps its seat height whichever day it is trained on.
 */
export interface ExerciseSettings {
  // Shown every time the movement is trained, e.g. the seat position.
  note?: string;
  // Hand-set progression rule; absent fields are learned from the log.
  repTop?: number;
  step?: number;
  // The muscle region picked by hand when the name does not tell
  // (data/muscleRegions); absent means the name decides.
  region?: string;
}

export interface WeekLog {
  id: string;
  weekNumber: number;
  programId: string;
  date: string;
  exercises: ExerciseLog[];
  notes: string;
  isHoliday: boolean;
  // Trained, but ill, short of sleep or in a rush: the next workout is
  // compared with the one before it instead.
  offDay?: boolean;
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

export interface ProgramVersion {
  phaseId: string;
  fromWeek: number; // phase-relative, inclusive until the next version
  programs: Program[];
  plans: Plan[];
  activePlanId: string | null;
}

export interface AppState {
  phaseRecordTransitions?: Record<string, boolean>;
  programVersions?: ProgramVersion[];
  // Cells of the removed manual Sheet send. Nothing reads them any more; they
  // stay typed so older data and backups keep round-tripping unchanged.
  sheetColumnMappings?: Record<string, unknown>;
  googleSheetsSettings?: GoogleSheetsPreferences;
  programs: Program[];
  plans: Plan[];
  activePlanId: string | null;
  weekLogs: WeekLog[];
  currentWeek: number;
  phases: PhaseDefinition[];
  dataVersion?: number;
  // Manual row order for the History grid, per program id. Absent/empty means
  // "no manual order yet" — History keeps deriving order from the week logs,
  // so existing users see no change until they move a row themselves.
  exerciseRowOrder?: Record<string, string[]>;
  // Muscle group picked by hand per exercise name (utils/muscleGroups
  // exerciseKey). Absent means every exercise uses the group its name suggests.
  muscleGroups?: Record<string, string>;
  // Per movement, keyed like muscleGroups. Absent means nothing was set.
  exerciseSettings?: Record<string, ExerciseSettings>;
  // History and the automatic Sheet leave out rows of movements taken out of
  // the program. Absent means they are shown, marked as taken out.
  hideRemovedExercises?: boolean;
  // Custom status colours and hand-painted History cells from before colours
  // became fixed. Nothing reads them any more; they stay typed so older data
  // and backups keep round-tripping unchanged.
  statusColors?: Partial<Record<ExerciseStatus, { dark: string; light: string }>>;
  cellColorOverrides?: Record<string, ExerciseStatus>;
  // Program updates from a coach already applied here, by id: each one is
  // applied once, whichever device gets it first.
  appliedCoachUpdates?: string[];
}

/** Program changes a coach sent, as the person's own app applies them. */
export interface CoachUpdatePayload {
  id: string;
  coachId: string;
  coachName: string;
  actions: AppAction[];
}

// ─── Reducer Actions ──────────────────────────────────

export type AppAction =
  | { type: 'CONFIGURE_PHASE_TRANSITION'; payload: { previousPhaseId: string; lastWeek: number; nextId: string } }
  | { type: 'COPY_PHASE_PROGRAM'; payload: { week: number; sourceWeek: number } }
  | { type: 'CLEAR_HISTORY_DATA'; payload: { programId: string; weeks: number[] } }
  | { type: 'SET_GOOGLE_SHEETS_SETTINGS'; payload: GoogleSheetsPreferences }
  | { type: 'ADD_PROGRAM'; atWeek?: number; payload: Program }
  | { type: 'UPDATE_PROGRAM'; atWeek?: number; payload: Program; syncCurrentLog?: boolean }
  | { type: 'DELETE_PROGRAM'; atWeek?: number; payload: string }
  | { type: 'ADD_PLAN'; atWeek?: number; payload: Plan }
  | { type: 'UPDATE_PLAN'; atWeek?: number; payload: Plan }
  | { type: 'DELETE_PLAN'; atWeek?: number; payload: string }
  | { type: 'SET_ACTIVE_PLAN'; atWeek?: number; payload: string }
  | { type: 'SAVE_WORKOUT'; payload: WeekLog }
  | { type: 'UPDATE_WORKOUT'; payload: WeekLog }
  | { type: 'DELETE_WORKOUT'; payload: string }
  | { type: 'SET_HOLIDAY'; payload: { programId: string; weekNumber: number } }
  | { type: 'INCREMENT_WEEK' }
  | { type: 'SET_WEEK'; payload: number }
  | { type: 'SET_PHASES'; payload: PhaseDefinition[] }
  | { type: 'SET_EXERCISE_ROW_ORDER'; payload: { programId: string; exerciseIds: string[] } }
  | { type: 'SET_MUSCLE_GROUP'; payload: { key: string; group: string | null } }
  | { type: 'SET_EXERCISE_SETTINGS'; payload: { key: string; settings: ExerciseSettings } }
  | { type: 'SET_HIDE_REMOVED_EXERCISES'; payload: boolean }
  | { type: 'APPLY_COACH_UPDATE'; payload: CoachUpdatePayload }
  | { type: 'IMPORT_DATA'; payload: AppState }
  | { type: 'RESET_DATA' };

// ─── Export Format ────────────────────────────────────

export interface ExportData {
  phaseRecordTransitions?: AppState['phaseRecordTransitions'];
  dataVersion?: number;
  programVersions?: ProgramVersion[];
  sheetColumnMappings?: AppState['sheetColumnMappings'];
  googleSheetsSettings?: GoogleSheetsPreferences;
  exportDate: string;
  version: string;
  programs: Program[];
  plans: Plan[];
  activePlanId: string | null;
  weekLogs: WeekLog[];
  currentWeek: number;
  phases?: PhaseDefinition[];
  exerciseRowOrder?: AppState['exerciseRowOrder'];
  muscleGroups?: AppState['muscleGroups'];
  exerciseSettings?: AppState['exerciseSettings'];
  hideRemovedExercises?: boolean;
  statusColors?: AppState['statusColors'];
  cellColorOverrides?: AppState['cellColorOverrides'];
  appliedCoachUpdates?: string[];
}

/** Non-secret preferences only. Google credentials never enter synced state. */
export interface GoogleSheetsPreferences {
  clientId: string;
  spreadsheetId: string;
  tabByProgramId: Record<string, string>;
}
