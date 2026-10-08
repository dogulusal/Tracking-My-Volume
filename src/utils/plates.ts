/** The plates found in most gyms here, heaviest first, kg. */
export const STANDARD_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

/** The bars a movement can be set to use, kg. */
export const BARS = [20, 15, 10];

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * What goes on each side of the bar for a total weight, heaviest plates first.
 * `missing` is what the plates cannot make up (a total not a multiple of
 * 2.5 kg); null when the total is no more than the bar itself.
 */
export function platesPerSide(total: number, bar: number, plates: number[] = STANDARD_PLATES): { plates: number[]; missing: number } | null {
  if (!(total > bar)) return null;
  let left = round((total - bar) / 2);
  const side: number[] = [];
  for (const plate of plates) {
    while (left >= plate - 1e-9) {
      side.push(plate);
      left = round(left - plate);
    }
  }
  return { plates: side, missing: round(left * 2) };
}
