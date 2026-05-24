/**
 * Estimate 1RM using Epley formula
 * 1RM = weight × (1 + reps / 30)
 */
export function estimate1RM(weight: number, reps: number): number {
  if (reps === 0 || weight === 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}
