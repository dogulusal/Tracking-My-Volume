/** The plates found in most gyms here, heaviest first, kg. */
export const STANDARD_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Every plate the gym can be said to have, kg; the standard set plus the small ones some gyms add. */
export const PLATE_OPTIONS = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5];

/** The bars a movement can be set to use, kg. */
export const BARS = [20, 15, 10];

const round = (value: number) => Math.round(value * 100) / 100;
// Every plate is a whole number of quarter kilos.
const UNIT = 4;

/**
 * What goes on each side of the bar for a total weight: the fewest plates
 * (without 15s, 40 kg a side is 20 + 20, not 25 + 10 + 5), heaviest first
 * among equals. `missing` is what the plates cannot make up (a total not a
 * multiple of 2.5 kg with the standard set); null when the total is no more
 * than the bar itself.
 */
export function platesPerSide(total: number, bar: number, plates: number[] = STANDARD_PLATES): { plates: number[]; missing: number } | null {
  if (!(total > bar)) return null;
  const units = [...new Set(plates.map(plate => Math.round(plate * UNIT)))].filter(unit => unit > 0).sort((a, b) => b - a);
  const target = Math.floor(round((total - bar) / 2) * UNIT + 1e-9);
  // fewest[n]: the fewest plates making exactly n quarter kilos.
  const fewest = new Array<number>(target + 1).fill(Infinity);
  fewest[0] = 0;
  for (let n = 1; n <= target; n++) {
    for (const unit of units) if (unit <= n && fewest[n - unit] + 1 < fewest[n]) fewest[n] = fewest[n - unit] + 1;
  }
  let reached = target;
  while (fewest[reached] === Infinity) reached--;
  const side: number[] = [];
  for (let n = reached; n > 0;) {
    const unit = units.find(item => item <= n && fewest[n - item] === fewest[n] - 1)!;
    side.push(unit / UNIT);
    n -= unit;
  }
  return { plates: side, missing: round(((total - bar) / 2 - reached / UNIT) * 2) };
}
