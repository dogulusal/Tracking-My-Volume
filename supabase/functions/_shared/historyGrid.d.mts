// Types for historyGrid.mjs, so the app can import the module the Edge
// Function uses without compiling JavaScript.

type Intensity = 'failure' | 'rir1' | 'rir2' | 'rir3';
type Status = 'improved' | 'decreased' | 'same' | 'holiday' | 'removed' | 'new';
export type GridSet = { weight: number; reps: number; intensity: Intensity | string };

export type GridPalette = {
  title: string; titleText: string; legend: string;
  header: string; headerText: string;
  label: string; canvas: string; ink: string; muted: string; rule: string;
  note: string; noteText: string;
  new: string; improved: string; decreased: string; same: string;
};

// `sets` is present on cells whose record has sets.
export type GridCell = { week: number; text: string; status: Status | null; sets?: GridSet[] };
export type GridRow = { exerciseId: string; name: string; defaultSets: number | null; cells: GridCell[] };
export type GridProgram = { id: string; name: string; order: number; rows: GridRow[]; notes: string[] };
export type PhaseGrid = { phaseId: string; name: string; startWeek: number; weeks: number[]; programs: GridProgram[] };

export const GRID_LEGEND: string;
export const GRID_PALETTE: { light: GridPalette; dark: GridPalette };
export function statusFill(palette: GridPalette, status: Status | null): string;
export function formatSetLine(set: GridSet): string;
export function calculateExerciseStatus(currentSets: GridSet[] | undefined, previousSets: GridSet[] | undefined): Status;
// Takes the app's state; typed loosely so the Edge Function's plain rows fit too.
export function buildPhaseGrid(state: object, phaseId: string): PhaseGrid | null;
