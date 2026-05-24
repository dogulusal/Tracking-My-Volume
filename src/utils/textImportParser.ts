/**
 * Parser for importing workout data from text/CSV/TSV formats.
 * Supports the spreadsheet format: "Exercise | Sets | H0 | H1 | ... | HN"
 * Each cell format: "weight x reps [F] [| weight x reps F]"
 */
import type { Program, WeekLog, SetLog, ExerciseLog, Intensity } from '@/types';

// ─── Parse a single set entry ─────────────────────────
// Handles: "45x5F", "45 x 5 F", "45x5", "4F" (carries weight from previous)
function parseSetEntry(raw: string, lastWeight: number): { set: SetLog; weight: number } | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === '0' || trimmed.toLowerCase() === 'x') return null;

  const isFailure = /F/i.test(trimmed);
  const intensity: Intensity = isFailure ? 'failure' : 'rir2';

  // Remove markers
  const cleaned = trimmed
    .replace(/F/gi, '')
    .replace(/\+\d+/g, '')
    .replace(/sağ|sol|right|left/gi, '')
    .replace(/\s+/g, '')
    .trim();

  // Try weight x reps pattern
  const match = cleaned.match(/([\d.,]+)[xX×]([\d.,]+)/);
  if (match) {
    const weight = parseFloat(match[1].replace(',', '.'));
    const reps = Math.round(parseFloat(match[2].replace(',', '.')));
    if (reps > 0) {
      return { set: { weight, reps, intensity }, weight };
    }
  }

  // Try reps-only pattern (weight carried from previous set)
  const repsMatch = cleaned.match(/^([\d.,]+)$/);
  if (repsMatch && lastWeight > 0) {
    const reps = Math.round(parseFloat(repsMatch[1].replace(',', '.')));
    if (reps > 0) {
      return { set: { weight: lastWeight, reps, intensity }, weight: lastWeight };
    }
  }

  return null;
}

// ─── Parse a cell containing one or more sets ─────────
// Handles: "45x5F|4F", "72.5x6F | 7F", "45 x 5 F"
export function parseCellToSets(cell: string): SetLog[] {
  if (!cell || cell.trim() === '' || cell.trim() === '-') return [];

  const parts = cell.split('|');
  const sets: SetLog[] = [];
  let lastWeight = 0;

  for (const part of parts) {
    const result = parseSetEntry(part, lastWeight);
    if (result) {
      sets.push(result.set);
      lastWeight = result.weight;
    }
  }

  return sets;
}

// ─── Parse tabular text (TSV/CSV) ────────────────────
// Expected format:
// Row 1: Header with "Egzersiz | Set | H0 | H1 | H2 | ..."
// Row 2+: "Exercise Name | SetCount | data | data | ..."

interface ParsedRow {
  exerciseName: string;
  defaultSets: number;
  weekData: string[]; // Raw cell values for each week
}

export function parseTabularText(text: string): {
  rows: ParsedRow[];
  weekCount: number;
  notes: Record<number, string>;
} {
  // Detect delimiter (tab or comma or multiple spaces)
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], weekCount: 0, notes: {} };

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitLine(lines[0], delimiter);

  // Find week columns (H0, H1, H2... or Week 0, Week 1...)
  const weekStartIndex = headerCells.findIndex(c =>
    /^H\d+$|^W\d+$|^Week\s*\d+$/i.test(c.trim())
  );
  if (weekStartIndex < 0) return { rows: [], weekCount: 0, notes: {} };

  const weekCount = headerCells.length - weekStartIndex;
  const rows: ParsedRow[] = [];
  const notes: Record<number, string> = {};

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delimiter);
    const exerciseName = cells[0]?.trim();

    if (!exerciseName) continue;

    // Check if this is a notes row
    if (/NOTLAR|NOTES/i.test(exerciseName)) {
      // Parse notes for each week
      for (let w = 0; w < weekCount; w++) {
        const noteCell = cells[weekStartIndex + w]?.trim();
        if (noteCell && noteCell !== '-') {
          notes[w] = noteCell;
        }
      }
      continue;
    }

    // Skip non-exercise rows
    if (/base kilo|header/i.test(exerciseName)) continue;

    const defaultSets = parseInt(cells[1]?.trim()) || 1;
    const weekData: string[] = [];

    for (let w = 0; w < weekCount; w++) {
      weekData.push(cells[weekStartIndex + w]?.trim() || '');
    }

    rows.push({ exerciseName, defaultSets, weekData });
  }

  return { rows, weekCount, notes };
}

function detectDelimiter(line: string): string {
  if (line.includes('\t')) return '\t';
  // Count potential delimiters
  const commaCount = (line.match(/,/g) || []).length;
  const semiCount = (line.match(/;/g) || []).length;
  if (semiCount > commaCount) return ';';
  if (commaCount > 3) return ',';
  return '\t'; // Default to tab
}

function splitLine(line: string, delimiter: string): string[] {
  // Handle quoted fields
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ─── Convert parsed data to Program + WeekLogs ───────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function convertParsedToProgram(
  programName: string,
  parsed: { rows: ParsedRow[]; weekCount: number; notes: Record<number, string> },
  startWeek: number = 0,
): { program: Program; weekLogs: WeekLog[] } {
  const programId = generateId('prog');
  const now = new Date().toISOString();

  // Build exercise definitions from first row data
  const exercises = parsed.rows.map((row, index) => {
    // Find first non-empty week to get default weight/reps
    const firstData = row.weekData.find(d => d && d !== '-' && d !== '0x0');
    const firstSets = firstData ? parseCellToSets(firstData) : [];
    const defaultWeight = firstSets[0]?.weight || 0;
    const defaultReps = firstSets[0]?.reps || 0;

    return {
      id: generateId(`ex${index}`),
      name: row.exerciseName,
      defaultSets: row.defaultSets,
      defaultWeight,
      defaultReps,
      isActive: true,
    };
  });

  const program: Program = {
    id: programId,
    name: programName,
    order: 1,
    exercises,
    createdAt: now,
    updatedAt: now,
  };

  // Build week logs
  const weekLogs: WeekLog[] = [];

  for (let w = 0; w < parsed.weekCount; w++) {
    const exerciseLogs: ExerciseLog[] = [];

    for (let r = 0; r < parsed.rows.length; r++) {
      const cellValue = parsed.rows[r].weekData[w];
      if (!cellValue || cellValue === '-') continue;

      const sets = parseCellToSets(cellValue);
      if (sets.length === 0) continue;

      exerciseLogs.push({
        exerciseId: exercises[r].id,
        exerciseName: exercises[r].name,
        sets,
      });
    }

    if (exerciseLogs.length === 0) continue;

    weekLogs.push({
      id: generateId(`wl${w}`),
      weekNumber: startWeek + w,
      programId,
      date: new Date(Date.now() - (parsed.weekCount - w) * 7 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0],
      exercises: exerciseLogs,
      notes: parsed.notes[w] || '',
      isHoliday: false,
      updatedAt: now,
    });
  }

  return { program, weekLogs };
}

// ─── Parse Excel-style clipboard (HTML table) ─────────
export function parseHtmlTable(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = doc.querySelectorAll('tr');

  const lines: string[] = [];
  rows.forEach(row => {
    const cells = row.querySelectorAll('td, th');
    const values: string[] = [];
    cells.forEach(cell => values.push(cell.textContent?.trim() || ''));
    lines.push(values.join('\t'));
  });

  return lines.join('\n');
}
