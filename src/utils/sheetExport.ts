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
import type { AppState, PhaseDefinition, Program, SetLog, WeekLog } from '@/types';
import { applySavedOrder } from '@/utils/reorder';
import { programVersionAt } from '@/utils/programVersions';

const INTENSITY_MARKERS: Record<SetLog['intensity'], string> = {
  failure: 'F',
  rir1: '+1',
  rir2: '+2',
  rir3: '+3',
};

const EMPTY_CELL = '-';
const HOLIDAY_CELL = 'TATİL';

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
  /** Absolute week numbers alone lose the mezo boundary the History page shows;
   *  with these a FAZ row carries it into the sheet. */
  phases?: PhaseDefinition[];
  /** Program snapshots preserve each week's exercise position independently of row layout. */
  state?: AppState;
}

export const PHASE_ROW = 'FAZ';
export const NOTES_ROW = 'NOTLAR';

function phaseNameForWeek(phases: PhaseDefinition[] | undefined, week: number): string {
  const match = phases?.find(phase =>
    week >= phase.startWeek && (phase.endWeek === null || week <= phase.endWeek));
  return match?.name ?? '';
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
  phases,
  state,
}: SheetTableOptions): string[][] {
  const weeks: number[] = [];
  for (let w = fromWeek; w <= toWeek; w++) weeks.push(w);

  const logsByWeek = new Map<number, WeekLog>();
  weekLogs
    .filter(log => log.programId === program.id && weeks.includes(log.weekNumber))
    .forEach(log => logsByWeek.set(log.weekNumber, log));

  // Include active definitions even when the range already has logs. A newly
  // added exercise must have a stable row before its first completed workout.
  const ids = new Set<string>();
  weeks.forEach(week => {
    logsByWeek.get(week)?.exercises.forEach(e => ids.add(e.exerciseId));
  });
  if (state) {
    weeks.forEach(week => programVersionAt(state, week).programs.find(p => p.id === program.id)
      ?.exercises.filter(e => e.isActive).forEach(e => ids.add(e.id)));
  } else {
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

  // Directly under the header, where a mezo boundary is read at a glance.
  const phaseCells = weeks.map(week => phaseNameForWeek(phases, week) || EMPTY_CELL);
  if (phaseCells.some(cell => cell !== EMPTY_CELL)) {
    rows.push([PHASE_ROW, '', ...phaseCells]);
  }

  exerciseIds.forEach(exerciseId => {
    const cells = weeks.map(week => {
      const log = logsByWeek.get(week);
      if (!log) return EMPTY_CELL;
      if (log.isHoliday) return HOLIDAY_CELL;
      const exercise = log.exercises.find(e => e.exerciseId === exerciseId);
      return formatSetsForSheet(exercise?.sets ?? []);
    });
    rows.push([nameOf(exerciseId), String(setsOf(exerciseId)), ...cells]);
    const orderCells = weeks.map(week => {
      const scopedProgram = state && programVersionAt(state, week).programs.find(p => p.id === program.id);
      const definitions = scopedProgram?.exercises.filter(ex => ex.isActive);
      const definedPosition = definitions?.findIndex(ex => ex.id === exerciseId) ?? -1;
      if (definedPosition >= 0) return String(definedPosition + 1);
      const loggedPosition = logsByWeek.get(week)?.exercises.findIndex(ex => ex.exerciseId === exerciseId) ?? -1;
      return loggedPosition >= 0 ? String(loggedPosition + 1) : EMPTY_CELL;
    });
    rows.push([`SIRA: ${nameOf(exerciseId)}`, '', ...orderCells]);
  });

  const noteCells = weeks.map(week => logsByWeek.get(week)?.notes?.trim() || EMPTY_CELL);
  if (noteCells.some(note => note !== EMPTY_CELL)) {
    rows.push([NOTES_ROW, '', ...noteCells]);
  }

  return rows;
}

const WEEK_LABEL = /^H(\d+)$/;

export interface MergeResult {
  rows: string[][];
  /**
   * The existing tab did not look like a table this app wrote — a different
   * header, or extra columns someone added by hand. Merging would quietly
   * throw that work away, so the caller has to decide instead.
   */
  unmergeable: boolean;
}

/**
 * Folds a freshly built table into whatever the tab already holds, matching on
 * the week label in the header and the exercise name in the first column.
 *
 * This is what lets a narrow export stay safe: sending H15–H19 leaves H0–H14
 * exactly where it was. An incoming empty cell never overwrites something the
 * sheet already has, so a week the app has no record of keeps whatever was
 * typed there by hand.
 */
export function mergeSheetRows(existing: string[][] | null, incoming: string[][]): MergeResult {
  const existingRows = (existing ?? []).filter(row => row.some(cell => cell?.trim()));
  if (existingRows.length === 0) return { rows: incoming, unmergeable: false };

  const header = existingRows[0].map(cell => cell?.trim() ?? '');
  const looksOurs = header[0] === 'Egzersiz'
    && header.slice(2).every(cell => WEEK_LABEL.test(cell));
  if (!looksOurs) return { rows: incoming, unmergeable: true };

  const incomingHeader = incoming[0];
  const columnsOf = (head: string[]) => {
    const map = new Map<string, number>();
    head.forEach((cell, index) => {
      if (index >= 2 && WEEK_LABEL.test(cell.trim())) map.set(cell.trim(), index);
    });
    return map;
  };
  const oldCols = columnsOf(header);
  const newCols = columnsOf(incomingHeader);

  const weeks = [...new Set([...oldCols.keys(), ...newCols.keys()])]
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  const rowsByName = (rows: string[][]) => {
    const map = new Map<string, string[]>();
    rows.slice(1).forEach(row => {
      const name = row[0]?.trim();
      if (name) map.set(name, row);
    });
    return map;
  };
  const oldRows = rowsByName(existingRows);
  const newRows = rowsByName(incoming);

  // Existing order is the user's; anything new lands after it. The two label
  // rows keep their places instead: the phase under the header, notes at the
  // bottom, wherever the incoming table happens to put them.
  const isNotes = (name: string) => /^(NOTLAR|NOTES)$/i.test(name);
  const isPhase = (name: string) => name.trim().toUpperCase() === PHASE_ROW;
  const isLabelRow = (name: string) => isNotes(name) || isPhase(name);

  const names = [
    ...[...oldRows.keys()].filter(name => !isLabelRow(name)),
    ...[...newRows.keys()].filter(name => !isLabelRow(name) && !oldRows.has(name)),
  ];
  const orderRows = new Set(names.filter(name => /^SIRA:/i.test(name)));
  const arrangedNames = names.filter(name => !orderRows.has(name)).flatMap(name => {
    const orderName = `SIRA: ${name}`;
    return orderRows.has(orderName) ? [name, orderName] : [name];
  });
  arrangedNames.push(...names.filter(name => orderRows.has(name) && !arrangedNames.includes(name)));
  const allNames = [...oldRows.keys(), ...newRows.keys()];
  const notesName = allNames.find(isNotes);
  const phaseName = allNames.find(isPhase);

  const buildRow = (name: string): string[] => {
    const oldRow = oldRows.get(name);
    const newRow = newRows.get(name);
    const sets = (newRow?.[1] ?? oldRow?.[1] ?? '').trim();

    const cells = weeks.map(week => {
      const before = oldCols.has(week) ? (oldRow?.[oldCols.get(week)!] ?? '').trim() : '';
      const after = newCols.has(week) ? (newRow?.[newCols.get(week)!] ?? '').trim() : '';
      // Emptiness never wins over content that is already in the sheet.
      if (after && after !== EMPTY_CELL) return after;
      if (before) return before;
      return after || EMPTY_CELL;
    });

    return [name, sets, ...cells];
  };

  const rows = [['Egzersiz', 'Set', ...weeks]];
  if (phaseName) rows.push(buildRow(phaseName));
  rows.push(...arrangedNames.map(buildRow));
  if (notesName) rows.push(buildRow(notesName));

  return { rows, unmergeable: false };
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

/**
 * The clipboard flavour carries the program name on its own first line, so a
 * copied table says what it is once it has left the app. The API flavour
 * (buildSheetRows) deliberately has no such line: there the tab already names
 * the program, and a title would push the header out of the first row where
 * mergeSheetRows looks for it.
 */
export function buildSheetTsv(options: SheetTableOptions): string {
  return `${options.program.name}\n${rowsToTsv(buildSheetRows(options))}`;
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
  const { weekLogs, fromWeek, toWeek, rowOrders, phases, state } = options;
  return programs
    .map(program => buildSheetTsv({
      program,
      weekLogs,
      fromWeek,
      toWeek,
      phases,
      state,
      rowOrder: rowOrders?.[program.id],
    }))
    .join('\n\n');
}
