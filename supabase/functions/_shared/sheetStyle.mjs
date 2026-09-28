import { GRID_PALETTE, statusFill } from './historyGrid.mjs';

const palette = GRID_PALETTE.light;
const rgb = hex => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 });
const color = hex => ({ rgbColor: rgb(hex) });
const text = (hex, bold = false, size = 10) => ({ fontFamily: 'Arial', fontSize: size, bold, foregroundColorStyle: color(hex) });
const range = (sheetId, row, endRow, col, endCol) => ({ sheetId, startRowIndex: row, endRowIndex: endRow, startColumnIndex: col, endColumnIndex: endCol });
const paint = (requests, area, format) => requests.push({ repeatCell: { range: area, cell: { userEnteredFormat: format }, fields: 'userEnteredFormat' } });
const size = (requests, sheetId, dimension, from, to, pixels) => requests.push({ updateDimensionProperties: { range: { sheetId, dimension, startIndex: from, endIndex: to }, properties: { pixelSize: pixels }, fields: 'pixelSize' } });

// About 19 characters of 9pt Arial fit on a line of a 128px week column; same
// estimate as the manual send (sheetLayout.ts).
/** @param {unknown[]} [row] */
function noteRowHeight(row = []) {
  const lines = Math.max(1, ...row.slice(2).map(value => String(value ?? '').split('\n')
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 19)), 0)));
  return Math.max(72, lines * 15 + 16);
}

export function buildAutoSheetStyleRequests(sheetId, sheet, existingMerges = []) {
  const requests = [];
  const width = Math.max(28, sheet.rows.reduce((max, row) => Math.max(max, row.length), 0));
  requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenColumnCount: 2 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenColumnCount' } });
  size(requests, sheetId, 'COLUMNS', 0, 1, 190);
  size(requests, sheetId, 'COLUMNS', 1, 2, 52);
  size(requests, sheetId, 'COLUMNS', 2, width, 128);
  for (const block of sheet.blocks) {
    const { titleRow, headerRow, notesRow } = block;
    if (!existingMerges.some(merge => merge.startRowIndex === titleRow && merge.endRowIndex === titleRow + 1
      && merge.startColumnIndex === 2 && merge.endColumnIndex === 8)) {
      requests.push({ mergeCells: { range: range(sheetId, titleRow, titleRow + 1, 2, 8), mergeType: 'MERGE_ALL' } });
    }
    paint(requests, range(sheetId, titleRow, titleRow + 1, 0, width), { backgroundColorStyle: color(palette.title), textFormat: text(palette.titleText, true, 11), verticalAlignment: 'MIDDLE' });
    paint(requests, range(sheetId, titleRow, titleRow + 1, 2, 8), { backgroundColorStyle: color(palette.title), textFormat: text(palette.legend, false, 9), horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' });
    paint(requests, range(sheetId, headerRow, headerRow + 1, 0, width), { backgroundColorStyle: color(palette.header), textFormat: text(palette.headerText, true), horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' });
    if (notesRow > headerRow + 1) {
      paint(requests, range(sheetId, headerRow + 1, notesRow, 0, 2), { backgroundColorStyle: color(palette.label), textFormat: text(palette.ink), verticalAlignment: 'MIDDLE' });
      paint(requests, range(sheetId, headerRow + 1, notesRow, 2, width), { backgroundColorStyle: color(palette.canvas), textFormat: text(palette.ink), horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' });
    }
    // A note wraps inside its own week column, centred, instead of spilling
    // over the next weeks; the row grows to fit the longest one.
    const notes = { backgroundColorStyle: color(palette.note), textFormat: text(palette.noteText, false, 9), verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' };
    paint(requests, range(sheetId, notesRow, notesRow + 1, 0, 2), { ...notes, horizontalAlignment: 'LEFT' });
    paint(requests, range(sheetId, notesRow, notesRow + 1, 2, width), { ...notes, horizontalAlignment: 'CENTER' });
    size(requests, sheetId, 'ROWS', titleRow, titleRow + 1, 34);
    size(requests, sheetId, 'ROWS', headerRow, headerRow + 1, 30);
    // Each set is its own line, so a row grows with its longest cell; same
    // estimate as the manual send (sheetLayout.ts).
    for (let row = headerRow + 1; row < notesRow; row++) {
      const lines = Math.max(1, ...sheet.rows[row].slice(2).map(value => String(value ?? '').split('\n').length));
      size(requests, sheetId, 'ROWS', row, row + 1, Math.max(34, lines * 18 + 12));
    }
    size(requests, sheetId, 'ROWS', notesRow, notesRow + 1, noteRowHeight(sheet.rows[notesRow]));
    if (notesRow + 2 <= sheet.rows.length) size(requests, sheetId, 'ROWS', notesRow + 1, Math.min(notesRow + 3, sheet.rows.length), 10);
    // Each cell carries the status History shows for it (blue reference,
    // green/grey/red against the nearest earlier record); holidays and empty
    // cells keep the plain canvas.
    for (let row = headerRow + 1; row < notesRow; row++) {
      const statuses = sheet.statuses?.[row] ?? [];
      for (let col = 2; col < statuses.length; col++) {
        const fill = statusFill(palette, statuses[col]);
        if (fill === palette.canvas) continue;
        paint(requests, range(sheetId, row, row + 1, col, col + 1), { backgroundColorStyle: color(fill), textFormat: text(palette.ink), horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' });
      }
    }
    requests.push({ updateBorders: { range: range(sheetId, headerRow + 1, notesRow + 1, 0, width), innerHorizontal: { style: 'SOLID', colorStyle: color(palette.rule) } } });
  }
  return requests;
}
