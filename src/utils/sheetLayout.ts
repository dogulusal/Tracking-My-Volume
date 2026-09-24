import { hexToRgb } from '@/utils/sheetFormat';

/** Restyle recognised workout blocks without moving or replacing values. */
export function buildSheetLayoutRequests(sheetId: number, rows: string[][], currentColumn: number): unknown[] {
  const requests: unknown[] = [];
  const color = (hex: string) => ({ rgbColor: hexToRgb(hex) });
  const range = (row: number, endRow: number, start: number, end: number) => ({ sheetId, startRowIndex: row, endRowIndex: endRow, startColumnIndex: start, endColumnIndex: end });
  const paint = (r: ReturnType<typeof range>, format: object) => requests.push({ repeatCell: { range: r, cell: { userEnteredFormat: format }, fields: Object.keys(format).map(key => `userEnteredFormat.${key}`).join(',') } });
  const size = (dimension: string, startIndex: number, endIndex: number, pixelSize: number) => requests.push({ updateDimensionProperties: { range: { sheetId, dimension, startIndex, endIndex }, properties: { pixelSize }, fields: 'pixelSize' } });
  const headers = rows.map((r, i) => r[0]?.trim() === 'Egzersiz' && r[1]?.trim() === 'Set' && /^H\d+$/.test(r[2] ?? '') ? i : -1).filter(i => i >= 0);
  let endColumn = 0;
  let latest = currentColumn;
  const notesPattern = /^(HAFTALIK NOTLAR|NOTLAR|NOTES)$/i;
  for (const [index, header] of headers.entries()) {
    const next = headers[index + 1] ?? rows.length;
    const note = rows.findIndex((r, i) => i > header && i < next && notesPattern.test(r[0]?.trim() ?? ''));
    if (note < 0) continue;
    let end = 2;
    while (/^H\d+$/.test(rows[header][end] ?? '')) end++;
    if (currentColumn >= end) continue;
    endColumn = Math.max(endColumn, end);
    const font = (foreground: string, bold = false) => ({ fontFamily: 'Arial', fontSize: 10, bold, foregroundColorStyle: color(foreground) });
    paint(range(header, header + 1, 0, end), { backgroundColorStyle: color('#424d57'), textFormat: font('#ffffff', true), horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' });
    paint(range(header, header + 1, currentColumn, currentColumn + 1), { backgroundColorStyle: color('#60758a') });
    size('ROWS', header, header + 1, 30);
    if (header > 0 && rows[header - 1]?.[0]?.trim() && !rows[header - 1]?.[1]?.trim() && !notesPattern.test(rows[header - 1][0])) {
      paint(range(header - 1, header, 0, end), { backgroundColorStyle: color('#29323a'), textFormat: font('#ffffff', true), verticalAlignment: 'MIDDLE' });
      size('ROWS', header - 1, header, 34);
    }
    for (let row = header + 1; row < note; row++) {
      if (!rows[row]?.[0]?.trim()) continue;
      paint(range(row, row + 1, 0, 2), { backgroundColorStyle: color('#f6f7f8'), textFormat: font('#29323a'), verticalAlignment: 'MIDDLE' });
      paint(range(row, row + 1, 1, end), { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' });
      const lines = Math.max(1, ...rows[row].slice(2, end).map(value => value.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 19)), 0)));
      size('ROWS', row, row + 1, Math.max(34, lines * 18 + 12));
    }
    const hasNotes = rows[note].slice(2).some(value => value.trim() && value.trim() !== '-');
    paint(range(note, note + 1, 0, end), { backgroundColorStyle: color('#fff4d6'), textFormat: { ...font('#5f5130'), fontSize: 9 }, horizontalAlignment: 'LEFT', verticalAlignment: 'TOP', wrapStrategy: 'CLIP' });
    size('ROWS', note, note + 1, hasNotes ? 72 : 32);
    requests.push({ updateBorders: { range: range(header + 1, note + 1, 0, end), innerHorizontal: { style: 'SOLID', colorStyle: color('#e1e4e8') }, innerVertical: { style: 'NONE' } } });
    for (let row = note + 1; row < next; row++) if (!rows[row]?.some(value => value.trim())) size('ROWS', row, row + 1, 10);
  }
  if (!endColumn) return [];
  requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenColumnCount: 2 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenColumnCount' } });
  for (const [start, end, pixels] of [[0, 1, 190], [1, 2, 52], [2, endColumn, 128]]) size('COLUMNS', start, end, pixels);
  rows.forEach((row, index) => {
    if (headers.includes(index)) return;
    row.forEach((value, column) => { if (column >= 2 && value.trim() && value.trim() !== '-') latest = Math.max(latest, column); });
  });
  const visibleEnd = Math.min(endColumn, latest + 3);
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: visibleEnd }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } });
  if (visibleEnd < endColumn) requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: visibleEnd, endIndex: endColumn }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } });
  return requests;
}
