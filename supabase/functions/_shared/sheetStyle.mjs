const rgb = hex => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 });
const color = hex => ({ rgbColor: rgb(hex) });
const text = (hex, bold = false, size = 10) => ({ fontFamily: 'Arial', fontSize: size, bold, foregroundColorStyle: color(hex) });
const range = (sheetId, row, endRow, col, endCol) => ({ sheetId, startRowIndex: row, endRowIndex: endRow, startColumnIndex: col, endColumnIndex: endCol });
const paint = (requests, area, format) => requests.push({ repeatCell: { range: area, cell: { userEnteredFormat: format }, fields: 'userEnteredFormat' } });
const size = (requests, sheetId, dimension, from, to, pixels) => requests.push({ updateDimensionProperties: { range: { sheetId, dimension, startIndex: from, endIndex: to }, properties: { pixelSize: pixels }, fields: 'pixelSize' } });

function score(value) {
  const match = String(value ?? '').match(/(-?\d+(?:[.,]\d+)?)\s*x\s*(\d+)/i);
  return match ? [Number(match[1].replace(',', '.')), Number(match[2])] : null;
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
    paint(requests, range(sheetId, titleRow, titleRow + 1, 0, width), { backgroundColorStyle: color('#29323a'), textFormat: text('#ffffff', true, 11), verticalAlignment: 'MIDDLE' });
    paint(requests, range(sheetId, titleRow, titleRow + 1, 2, 8), { backgroundColorStyle: color('#29323a'), textFormat: text('#d8dde1', false, 9), horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' });
    paint(requests, range(sheetId, headerRow, headerRow + 1, 0, width), { backgroundColorStyle: color('#424d57'), textFormat: text('#ffffff', true), horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' });
    if (notesRow > headerRow + 1) {
      paint(requests, range(sheetId, headerRow + 1, notesRow, 0, 2), { backgroundColorStyle: color('#f6f7f8'), textFormat: text('#24312b'), verticalAlignment: 'MIDDLE' });
      paint(requests, range(sheetId, headerRow + 1, notesRow, 2, width), { backgroundColorStyle: color('#ffffff'), textFormat: text('#24312b'), horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' });
    }
    paint(requests, range(sheetId, notesRow, notesRow + 1, 0, width), { backgroundColorStyle: color('#fff4d6'), textFormat: text('#5f5130', false, 9), horizontalAlignment: 'LEFT', verticalAlignment: 'TOP', wrapStrategy: 'CLIP' });
    size(requests, sheetId, 'ROWS', titleRow, titleRow + 1, 34);
    size(requests, sheetId, 'ROWS', headerRow, headerRow + 1, 30);
    if (notesRow > headerRow + 1) size(requests, sheetId, 'ROWS', headerRow + 1, notesRow, 34);
    size(requests, sheetId, 'ROWS', notesRow, notesRow + 1, 72);
    if (notesRow + 2 <= sheet.rows.length) size(requests, sheetId, 'ROWS', notesRow + 1, Math.min(notesRow + 3, sheet.rows.length), 10);
    for (let row = headerRow + 1; row < notesRow; row++) {
      const values = sheet.rows[row];
      for (let col = 3; col < values.length; col++) {
        const previous = score(values[col - 1]);
        const current = score(values[col]);
        if (!previous || !current) continue;
        const comparison = current[0] === previous[0] ? current[1] - previous[1] : current[0] - previous[0];
        const shade = comparison > 0 ? '#dcebd7' : comparison < 0 ? '#f6d3d4' : '#e8edf0';
        paint(requests, range(sheetId, row, row + 1, col, col + 1), { backgroundColorStyle: color(shade), textFormat: text('#24312b'), horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' });
      }
    }
    requests.push({ updateBorders: { range: range(sheetId, headerRow + 1, notesRow + 1, 0, width), innerHorizontal: { style: 'SOLID', colorStyle: color('#e1e4e8') } } });
  }
  return requests;
}
