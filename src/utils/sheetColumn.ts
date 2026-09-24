import type { ExerciseStatus } from '@/types';
import { foregroundForRgb, hexToRgb, SHEET_STATUS_COLORS } from '@/utils/sheetFormat';

export interface ColumnCell { row: number; label: string; value: string; color?: string; kind?: 'data' | 'note' }
export interface WeekColumnTarget { tab: string; column: number; cells: ColumnCell[] }
export const SHEET_NOTE_COLOR = '#fff4d6';

/** A phase send fills only wholly empty result columns. Headers may already be present. */
export function hasMappedWeekData(rows: string[][], target: WeekColumnTarget): boolean {
  return target.cells.slice(1).some(cell => String(rows[cell.row - 1]?.[target.column] ?? '').trim() !== '');
}

export function parseCellAddress(address: string): { column: number; row: number } {
  const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(address.trim().toUpperCase());
  if (!match) throw new Error('Başlık hücresini W1 gibi gir.');
  let column = 0;
  for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (column > 18278 || row > 1000000) throw new Error('Hücre adresi desteklenen aralığın dışında.');
  return { column: column - 1, row };
}

export function columnLetters(column: number): string {
  if (!Number.isInteger(column) || column < 0 || column >= 18278) throw new Error('Geçersiz sütun.');
  let value = column + 1;
  let letters = '';
  while (value > 0) { value--; letters = String.fromCharCode(65 + value % 26) + letters; value = Math.floor(value / 26); }
  return letters;
}

export function columnStatusColor(status: ExerciseStatus): string {
  return SHEET_STATUS_COLORS[status];
}

/** One atomic batch, limited to explicitly mapped cells; never clears a tab. */
export function buildColumnRequests(sheetId: number, column: number, cells: ColumnCell[]) {
  columnLetters(column);
  const used = new Set<number>();
  if (!cells.length) throw new Error('Gönderilecek hücre yok.');
  return cells.map(cell => {
    if (!Number.isInteger(cell.row) || cell.row < 1 || cell.row > 1000000 || used.has(cell.row)) {
      throw new Error('Her alan için farklı, geçerli bir satır numarası seç.');
    }
    used.add(cell.row);
    const fill = cell.color ? hexToRgb(cell.color) : undefined;
    const isNote = cell.kind === 'note';
    const userEnteredFormat = fill ? {
      backgroundColorStyle: { rgbColor: fill },
      textFormat: {
        fontFamily: 'Arial',
        fontSize: isNote ? 9 : 10,
        foregroundColorStyle: { rgbColor: foregroundForRgb(fill) },
      },
      wrapStrategy: isNote ? 'CLIP' : 'WRAP',
      horizontalAlignment: isNote ? 'LEFT' : 'CENTER',
      verticalAlignment: isNote ? 'TOP' : 'MIDDLE',
    } : undefined;
    return { updateCells: {
      range: { sheetId, startRowIndex: cell.row - 1, endRowIndex: cell.row, startColumnIndex: column, endColumnIndex: column + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: cell.value }, ...(userEnteredFormat ? { userEnteredFormat } : {}) }] }],
      fields: 'userEnteredValue' + (cell.color ? ',userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment' : ''),
    } };
  });
}

export function buildWeekRequests(targets: { sheetId: number; column: number; cells: ColumnCell[] }[]) {
  if (!targets.length) throw new Error('Gönderilecek antrenman yok.');
  const used = new Set<string>();
  return targets.flatMap(target => {
    const requests = buildColumnRequests(target.sheetId, target.column, target.cells);
    for (const cell of target.cells) {
      const key = `${target.sheetId}:${target.column}:${cell.row}`;
      if (used.has(key)) throw new Error(`Antrenmanların hedefleri çakışıyor: ${columnLetters(target.column)}${cell.row}. Satır eşleştirmesini düzelt.`);
      used.add(key);
    }
    return requests;
  });
}
