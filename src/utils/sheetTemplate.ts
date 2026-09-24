import type { Program, WeekLog } from '@/types';
import { applySavedOrder } from '@/utils/reorder';
import { hexToRgb } from '@/utils/sheetFormat';
import { buildSheetLayoutRequests } from '@/utils/sheetLayout';

export interface SheetMapping { tab: string; header: string; week: number; rows: Record<string, number>; notesRow: number }
export interface PhaseSheetLayout {
  title: string; baseWeek: number; rowCount: number;
  blocks: { programId: string; name: string; titleRow: number; headerRow: number; notesRow: number; exercises: { id: string; name: string; sets: number; row: number }[] }[];
  mappings: Record<string, SheetMapping>;
}

export function buildPhaseSheetLayout(title: string, baseWeek: number, programs: Program[], logs: WeekLog[], rowOrders?: Record<string, string[]>): PhaseSheetLayout {
  title = title.trim();
  if (!title || title.length > 100 || /[\[\]:*?/\\]/.test(title)) throw new Error('Geçerli bir sekme adı gir.');
  if (!programs.length) throw new Error('Şablon için en az bir antrenman gerekli.');
  let row = 1;
  const mappings: Record<string, SheetMapping> = {};
  const blocks = programs.map(program => {
    const definitions = new Map(program.exercises.filter(e => e.isActive).map(e => [e.id, { id: e.id, name: e.name, sets: e.defaultSets }]));
    for (const log of logs.filter(l => l.programId === program.id && l.weekNumber >= baseWeek)) {
      for (const ex of log.exercises) if (!definitions.has(ex.exerciseId)) definitions.set(ex.exerciseId, { id: ex.exerciseId, name: ex.exerciseName, sets: ex.sets.length });
    }
    const titleRow = row++;
    const headerRow = row++;
    const exercises = applySavedOrder([...definitions.keys()], rowOrders?.[program.id]).map(id => ({ ...definitions.get(id)!, row: row++ }));
    const notesRow = row++;
    row += 2;
    mappings[program.id] = { tab: title, header: `C${headerRow}`, week: baseWeek, rows: Object.fromEntries(exercises.map(e => [e.id, e.row])), notesRow };
    return { programId: program.id, name: program.name, titleRow, headerRow, exercises, notesRow };
  });
  return { title, baseWeek, blocks, mappings, rowCount: row };
}

/** All requests target a newly allocated sheet, so existing tabs cannot be cleared. */
export function buildPhaseTemplateRequests(sheetId: number, layout: PhaseSheetLayout): unknown[] {
  const columns = 106; // H0–H103; weekly sends fill the relevant header.
  const visibleColumns = 28; // Exercise + Set + the phase's first 26 weeks.
  const bg = (hex: string) => ({ rgbColor: hexToRgb(hex) });
  const textCell = (text: string) => ({ userEnteredValue: { stringValue: text }, userEnteredFormat: {
    textFormat: { fontFamily: 'Arial', fontSize: 10, foregroundColorStyle: bg('#24312b') },
    wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE',
  } });
  const rows: { values: ReturnType<typeof textCell>[] }[] = Array.from({ length: layout.rowCount }, () => ({ values: [] }));
  const requests: unknown[] = [{ addSheet: { properties: {
    sheetId,
    title: layout.title,
    gridProperties: {
      rowCount: Math.max(100, layout.rowCount),
      columnCount: columns,
      frozenColumnCount: 2,
      hideGridlines: true,
    },
  } } }];
  for (const block of layout.blocks) {
    rows[block.titleRow - 1].values = [
      textCell(block.name),
      textCell(''),
      textCell('Yeşil: ilerleme  ·  Gri: aynı  ·  Kırmızı: düşüş'),
    ];
    rows[block.headerRow - 1].values = ['Egzersiz', 'Set', ...Array.from({ length: 26 }, (_, i) => `H${i}`)].map(textCell);
    for (const ex of block.exercises) rows[ex.row - 1].values = [textCell(ex.name), textCell(String(ex.sets))];
    rows[block.notesRow - 1].values = [textCell('HAFTALIK NOTLAR')];
  }
  requests.push({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows, fields: 'userEnteredValue,userEnteredFormat' } });

  const border = { style: 'SOLID', colorStyle: bg('#d9e2de') };
  for (const block of layout.blocks) {
    const titleStart = block.titleRow - 1;
    const headerStart = block.headerRow - 1;
    const exerciseStart = block.exercises[0]?.row ? block.exercises[0].row - 1 : block.notesRow - 1;
    const notesStart = block.notesRow - 1;
    // Empty workout blocks still need valid, non-zero API ranges; the notes
    // styling below wins over this temporary one-row body range.
    const bodyEnd = Math.max(exerciseStart + 1, notesStart);

    requests.push(
      { mergeCells: { range: { sheetId, startRowIndex: titleStart, endRowIndex: titleStart + 1, startColumnIndex: 2, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } },
      { repeatCell: { range: { sheetId, startRowIndex: titleStart, endRowIndex: titleStart + 1, startColumnIndex: 0, endColumnIndex: visibleColumns }, cell: { userEnteredFormat: {
        backgroundColorStyle: bg('#29323a'),
        textFormat: { fontFamily: 'Arial', fontSize: 11, bold: true, foregroundColorStyle: bg('#ffffff') },
        verticalAlignment: 'MIDDLE',
      } }, fields: 'userEnteredFormat' } },
      { repeatCell: { range: { sheetId, startRowIndex: titleStart, endRowIndex: titleStart + 1, startColumnIndex: 2, endColumnIndex: 8 }, cell: { userEnteredFormat: {
        backgroundColorStyle: bg('#29323a'),
        textFormat: { fontFamily: 'Arial', fontSize: 9, bold: false, foregroundColorStyle: bg('#d8dde1') },
        horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE',
      } }, fields: 'userEnteredFormat' } },
      { repeatCell: { range: { sheetId, startRowIndex: headerStart, endRowIndex: headerStart + 1, startColumnIndex: 0, endColumnIndex: visibleColumns }, cell: { userEnteredFormat: {
        backgroundColorStyle: bg('#424d57'),
        textFormat: { fontFamily: 'Arial', fontSize: 10, bold: true, foregroundColorStyle: bg('#ffffff') },
        horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      } }, fields: 'userEnteredFormat' } },
      { repeatCell: { range: { sheetId, startRowIndex: exerciseStart, endRowIndex: bodyEnd, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: {
        backgroundColorStyle: bg('#f6f7f8'),
        textFormat: { fontFamily: 'Arial', fontSize: 10, foregroundColorStyle: bg('#24312b') },
        verticalAlignment: 'MIDDLE',
      } }, fields: 'userEnteredFormat' } },
      { repeatCell: { range: { sheetId, startRowIndex: exerciseStart, endRowIndex: bodyEnd, startColumnIndex: 1, endColumnIndex: visibleColumns }, cell: { userEnteredFormat: {
        horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
      } }, fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy' } },
      { repeatCell: { range: { sheetId, startRowIndex: notesStart, endRowIndex: notesStart + 1, startColumnIndex: 0, endColumnIndex: visibleColumns }, cell: { userEnteredFormat: {
        backgroundColorStyle: bg('#fff4d6'),
        textFormat: { fontFamily: 'Arial', fontSize: 9, bold: false, foregroundColorStyle: bg('#5f5130') },
        horizontalAlignment: 'LEFT', verticalAlignment: 'TOP', wrapStrategy: 'CLIP',
      } }, fields: 'userEnteredFormat' } },
      { updateBorders: { range: { sheetId, startRowIndex: headerStart, endRowIndex: notesStart + 1, startColumnIndex: 0, endColumnIndex: visibleColumns }, top: border, bottom: border, left: border, right: border, innerHorizontal: border } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: titleStart, endIndex: titleStart + 1 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: headerStart, endIndex: headerStart + 1 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: exerciseStart, endIndex: bodyEnd }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: notesStart, endIndex: notesStart + 1 }, properties: { pixelSize: 72 }, fields: 'pixelSize' } },
    );
  }

  for (const [startIndex, endIndex, pixelSize] of [[0, 1, 190], [1, 2, 52], [2, visibleColumns, 128]]) {
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex, endIndex }, properties: { pixelSize }, fields: 'pixelSize' } });
  }
  requests.push(...buildSheetLayoutRequests(sheetId, rows.map(row => row.values.map(cell => cell.userEnteredValue.stringValue)), 2));
  return requests;
}
