/**
 * Builds the History grid as a tab-separated table, in the same dialect
 * textImportParser reads back: header "Egzersiz | Set | H0 | H1 | ..." with
 * cells like "45x5F|4F". Pasting the output into a single Google Sheets cell
 * spreads it over the rows and columns, so the sheet ends up looking like the
 * grid on the History page.
 *
 * Week columns are labelled with the absolute week number (H15, H16 ...), not
 * the phase-relative one History displays, so that columns stay unique and
 * monotonic in a sheet that keeps growing across mezos.
 */
import type { Program, SetLog, WeekLog } from '@/types';
import { applySavedOrder } from '@/utils/reorder';

const INTENSITY_MARKERS: Record<SetLog['intensity'], string> = {
  failure: 'F',
  rir1: '+1',
  rir2: '+2',
  rir3: '+3',
};

const EMPTY_CELL = '-';
const HOLIDAY_CELL = 'Tatil';

/**
 * One grid cell: every set in order, pipe separated. The weight is written
 * only when it changes from the previous set ("45x5F|4F") — the shorthand the
 * sheet already uses, and the one parseCellToSets carries forward on import.
 */
export function formatSetsForSheet(sets: SetLog[]): string {
  if (sets.length === 0) return EMPTY_CELL;

  let lastWeight: number | null = null;
  return sets
    .map(set => {
      const body = set.weight === lastWeight ? `${set.reps}` : `${set.weight}x${set.reps}`;
      lastWeight = set.weight;
      return `${body}${INTENSITY_MARKERS[set.intensity]}`;
    })
    .join('|');
}

export interface SheetTableOptions {
  program: Program;
  weekLogs: WeekLog[];
  fromWeek: number;
  toWeek: number;
  /** state.exerciseRowOrder[program.id] — keeps the sheet's row order in sync
   *  with the order the user dragged the History rows into. */
  rowOrder?: string[];
}

/**
 * The table as a matrix of cells: header row, one row per exercise, then a
 * NOTLAR row when any exported week has notes (parseTabularText reads that row
 * back into WeekLog.notes).
 */
export function buildSheetRows({
  program,
  weekLogs,
  fromWeek,
  toWeek,
  rowOrder,
}: SheetTableOptions): string[][] {
  const weeks: number[] = [];
  for (let w = fromWeek; w <= toWeek; w++) weeks.push(w);

  const logsByWeek = new Map<number, WeekLog>();
  weekLogs
    .filter(log => log.programId === program.id && weeks.includes(log.weekNumber))
    .forEach(log => logsByWeek.set(log.weekNumber, log));

  // Rows come from what was actually logged in the range; an empty range falls
  // back to the program's active exercises so the paste still has its skeleton.
  const ids = new Set<string>();
  weeks.forEach(week => {
    logsByWeek.get(week)?.exercises.forEach(e => ids.add(e.exerciseId));
  });
  if (ids.size === 0) {
    program.exercises.filter(e => e.isActive).forEach(e => ids.add(e.id));
  }
  const exerciseIds = applySavedOrder(Array.from(ids), rowOrder);

  // An exercise deleted from the program still has its name on the logs.
  const nameOf = (exerciseId: string): string => {
    const def = program.exercises.find(e => e.id === exerciseId);
    if (def) return def.name;
    for (const week of weeks) {
      const logged = logsByWeek.get(week)?.exercises.find(e => e.exerciseId === exerciseId);
      if (logged?.exerciseName) return logged.exerciseName;
    }
    return exerciseId;
  };

  const setsOf = (exerciseId: string): number => {
    return program.exercises.find(e => e.id === exerciseId)?.defaultSets ?? 1;
  };

  const rows: string[][] = [
    ['Egzersiz', 'Set', ...weeks.map(w => `H${w}`)],
  ];

  exerciseIds.forEach(exerciseId => {
    const cells = weeks.map(week => {
      const log = logsByWeek.get(week);
      if (!log) return EMPTY_CELL;
      if (log.isHoliday) return HOLIDAY_CELL;
      const exercise = log.exercises.find(e => e.exerciseId === exerciseId);
      return formatSetsForSheet(exercise?.sets ?? []);
    });
    rows.push([nameOf(exerciseId), String(setsOf(exerciseId)), ...cells]);
  });

  const noteCells = weeks.map(week => logsByWeek.get(week)?.notes?.trim() || EMPTY_CELL);
  if (noteCells.some(note => note !== EMPTY_CELL)) {
    rows.push(['NOTLAR', '', ...noteCells]);
  }

  return rows;
}

/**
 * Tabs separate columns and newlines separate rows — that is exactly what
 * Google Sheets and Excel split a pasted clipboard string on. A cell's own
 * newlines would break that, so notes are flattened to a single line.
 */
export function rowsToTsv(rows: string[][]): string {
  return rows
    .map(row => row.map(cell => cell.replace(/\s*\n\s*/g, ' ')).join('\t'))
    .join('\n');
}

export function buildSheetTsv(options: SheetTableOptions): string {
  return rowsToTsv(buildSheetRows(options));
}

/**
 * Several programs in one paste: each table under its own program name, blocks
 * separated by a blank line. Handy for filling a sheet in one go, but only a
 * single-program block can be pasted back into "Tablo/spreadsheet'ten yükle" —
 * the importer reads the header from the first line.
 */
export function buildMultiProgramTsv(
  programs: Program[],
  options: Omit<SheetTableOptions, 'program' | 'rowOrder'> & {
    rowOrders?: Record<string, string[]>;
  },
): string {
  const { weekLogs, fromWeek, toWeek, rowOrders } = options;
  return programs
    .map(program => {
      const table = buildSheetTsv({
        program,
        weekLogs,
        fromWeek,
        toWeek,
        rowOrder: rowOrders?.[program.id],
      });
      return `${program.name}\n${table}`;
    })
    .join('\n\n');
}
