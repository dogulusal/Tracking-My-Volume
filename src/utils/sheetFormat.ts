/**
 * Cell colours for the sheet, derived exactly the way the History grid derives
 * them — same comparison, same phase boundary, same manual overrides — so the
 * sheet and the app never disagree about what counts as progress.
 *
 * The sheet keeps its own palette. The app's surfaces are deliberately muted;
 * the sheet has been colour-coded by hand for months in saturated Google Sheets
 * colours, and that is the look being continued here. A status the user has
 * explicitly repainted in History's ⚙️ panel still overrides it — that panel
 * would otherwise be lying about what it controls.
 */
import type { ExerciseStatus, PhaseDefinition, Program, WeekLog } from '@/types';
import { calculateExerciseStatus } from '@/utils/statusCalculator';

export type StatusColorOverrides = Partial<Record<ExerciseStatus, { dark: string; light: string }>>;

/**
 * The colours the sheet already uses, read off it rather than invented. Change
 * a value here and the next send repaints in the new colour.
 */
export const SHEET_STATUS_COLORS: Record<ExerciseStatus, string> = {
  improved: '#00ff00',
  decreased: '#ff0000',
  same: '#cccccc',
  holiday: '#a64d79',
  removed: '#000000',
  // Nothing to compare against in the first week of a mezo, so the sheet leaves
  // those cells plain rather than claiming a direction.
  new: '#ffffff',
};

export interface StatusMapOptions {
  program: Program;
  weekLogs: WeekLog[];
  fromWeek: number;
  toWeek: number;
  phases?: PhaseDefinition[];
  /** History's per-cell repaints, keyed the same way the app keys them. */
  getCellOverride?: (weekNumber: number, exerciseId: string) => ExerciseStatus | undefined;
}

/** Row label and week label are what the merged sheet grid can be matched on. */
export function statusKey(exerciseName: string, weekLabel: string): string {
  return `${exerciseName}\u0000${weekLabel}`;
}

function phaseStartFor(phases: PhaseDefinition[] | undefined, week: number): number {
  const match = phases?.find(phase =>
    week >= phase.startWeek && (phase.endWeek === null || week <= phase.endWeek));
  return match?.startWeek ?? 0;
}

export function buildStatusMap({
  program,
  weekLogs,
  fromWeek,
  toWeek,
  phases,
  getCellOverride,
}: StatusMapOptions): Map<string, ExerciseStatus> {
  const logsByWeek = new Map<number, WeekLog>();
  weekLogs
    .filter(log => log.programId === program.id)
    .forEach(log => logsByWeek.set(log.weekNumber, log));

  const exerciseLogAt = (week: number, exerciseId: string) =>
    logsByWeek.get(week)?.exercises.find(e => e.exerciseId === exerciseId);

  const nameOf = (exerciseId: string): string => {
    const def = program.exercises.find(e => e.id === exerciseId);
    if (def) return def.name;
    for (let w = toWeek; w >= fromWeek; w--) {
      const logged = exerciseLogAt(w, exerciseId);
      if (logged?.exerciseName) return logged.exerciseName;
    }
    return exerciseId;
  };

  const ids = new Set<string>();
  for (let w = fromWeek; w <= toWeek; w++) {
    logsByWeek.get(w)?.exercises.forEach(e => ids.add(e.exerciseId));
  }
  if (ids.size === 0) {
    program.exercises.filter(e => e.isActive).forEach(e => ids.add(e.id));
  }

  const statuses = new Map<string, ExerciseStatus>();

  for (let week = fromWeek; week <= toWeek; week++) {
    const weekLog = logsByWeek.get(week);
    const phaseStart = phaseStartFor(phases, week);

    ids.forEach(exerciseId => {
      // The comparison never reaches back past the start of the mezo: a new
      // block starts its own progression, exactly as the History grid shows it.
      let previous;
      for (let w = week - 1; w >= phaseStart; w--) {
        const found = exerciseLogAt(w, exerciseId);
        if (found) { previous = found; break; }
      }

      const current = exerciseLogAt(week, exerciseId);
      let status: ExerciseStatus = 'same';
      if (weekLog?.isHoliday) status = 'holiday';
      else if (current) status = previous ? calculateExerciseStatus(current.sets, previous.sets) : 'new';
      else if (previous) status = 'removed';

      statuses.set(statusKey(nameOf(exerciseId), `H${week}`),
        getCellOverride?.(week, exerciseId) ?? status);
    });
  }

  return statuses;
}

export interface RgbColor { red: number; green: number; blue: number }

export function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const value = parseInt(full, 16);
  return {
    red: ((value >> 16) & 255) / 255,
    green: ((value >> 8) & 255) / 255,
    blue: (value & 255) / 255,
  };
}

export function statusColor(status: ExerciseStatus, overrides?: StatusColorOverrides): RgbColor {
  // An in-app repaint of a status still wins, so the ⚙️ panel is not a lie.
  const override = overrides?.[status]?.light;
  return hexToRgb(override ?? SHEET_STATUS_COLORS[status]);
}

/** Groups column indices into contiguous runs, one API range per run. */
export function contiguousRuns(indices: number[]): { start: number; end: number }[] {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const runs: { start: number; end: number }[] = [];
  for (const index of sorted) {
    const last = runs[runs.length - 1];
    if (last && index === last.end) last.end = index + 1;
    else runs.push({ start: index, end: index + 1 });
  }
  return runs;
}

export interface CellFormatRange {
  rowIndex: number;
  startColumnIndex: number;
  /** One colour per column in [startColumnIndex, startColumnIndex + colors.length). */
  colors: RgbColor[];
}

/**
 * Turns the merged grid into the ranges to paint.
 *
 * Only cells whose status the app actually knows are included, so a row the
 * sheet has and the app does not — or a week outside the send — keeps its
 * existing colour instead of being blanked.
 */
export function buildFormatRanges(
  rows: string[][],
  weekLabels: string[],
  statuses: Map<string, ExerciseStatus>,
  overrides?: StatusColorOverrides,
): CellFormatRange[] {
  if (rows.length === 0) return [];

  const header = rows[0].map(cell => cell?.trim() ?? '');
  const sent = new Set(weekLabels);
  const ranges: CellFormatRange[] = [];

  rows.forEach((row, rowIndex) => {
    if (rowIndex === 0) return;
    const name = row[0]?.trim();
    if (!name) return;

    const known = new Map<number, ExerciseStatus>();
    header.forEach((label, column) => {
      if (column < 2 || !sent.has(label)) return;
      const status = statuses.get(statusKey(name, label));
      if (status) known.set(column, status);
    });
    if (known.size === 0) return;

    contiguousRuns([...known.keys()]).forEach(run => {
      const colors: RgbColor[] = [];
      for (let column = run.start; column < run.end; column++) {
        colors.push(statusColor(known.get(column)!, overrides));
      }
      ranges.push({ rowIndex, startColumnIndex: run.start, colors });
    });
  });

  return ranges;
}
