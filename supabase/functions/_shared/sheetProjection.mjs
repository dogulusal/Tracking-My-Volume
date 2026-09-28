// This module has no browser dependencies so it can run in the Edge Function
// and in Node's regression tests. The rows, their text and each cell's status
// come from historyGrid.mjs, the same grid the app's History page draws.
import { GRID_LEGEND, buildPhaseGrid } from './historyGrid.mjs';

const cleanTitle = (name, startWeek) => `Oto · ${String(name || `Faz ${startWeek}`).replace(/[\[\]:*?/\\]/g, ' ').trim()} · ${startWeek}`.slice(0, 100);

/**
 * @param {any} state
 * @param {{ phaseId: string, programId?: string | null, weekMode?: string, weekNumber?: number } | null} [selection]
 */
export function projectSheets(state, selection = null) {
  const phases = [...(state.phases ?? [])].sort((a, b) => a.startWeek - b.startWeek);
  return phases.filter(phase => !selection || phase.id === selection.phaseId).map(phase => {
    const grid = buildPhaseGrid(state, phase.id);
    // A phase that has not reached its H0 yet still gets one (empty) column.
    const weeks = grid.weeks.length ? grid.weeks : [phase.startWeek];
    const end = weeks[weeks.length - 1];
    const selectedStart = selection?.weekMode === 'all' || !selection ? phase.startWeek : Math.max(phase.startWeek, selection?.weekNumber ?? end);
    const selectedEnd = selection?.weekMode === 'one' ? selectedStart : end;
    const shown = week => week >= selectedStart && week <= selectedEnd;
    const width = weeks.length + 2;
    const rows = [];
    // Per row, the status of each column (null where nothing is compared);
    // sheetStyle paints from this instead of re-reading the cell text.
    const statuses = [];
    const blocks = [];
    for (const program of grid.programs.filter(program => !selection?.programId || program.id === selection.programId)) {
      const titleRow = rows.length;
      rows.push([program.name, '', GRID_LEGEND]);
      rows.push(['Egzersiz', 'Set', ...weeks.map(week => `H${week - phase.startWeek}`)]);
      statuses.push([], []);
      for (const row of program.rows) {
        const cells = weeks.map((week, index) => shown(week) ? row.cells[index] : undefined);
        rows.push([row.name, row.defaultSets == null ? '' : String(row.defaultSets), ...cells.map(cell => cell?.text ?? '')]);
        statuses.push([null, null, ...cells.map(cell => cell?.status ?? null)]);
      }
      rows.push(['HAFTALIK NOTLAR', '', ...weeks.map((week, index) => shown(week) ? program.notes[index] ?? '' : '')]);
      statuses.push([]);
      blocks.push({ titleRow, headerRow: titleRow + 1, notesRow: rows.length - 1 });
      rows.push([], []);
      statuses.push([], []);
    }
    // A new account has no workouts yet. Keep its managed phase tab so the
    // worker can clear/write it without trying to delete the file's last tab.
    if (!rows.length) rows.push([phase.name], ['Henüz antrenman programı yok.']);
    return { phaseId: phase.id, title: cleanTitle(phase.name, phase.startWeek), rows, statuses, blocks,
      rowCount: Math.max(100, rows.length + 1), columnCount: Math.max(28, width) };
  });
}
