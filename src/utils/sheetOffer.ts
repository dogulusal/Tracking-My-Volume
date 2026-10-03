export interface SheetOfferInput {
  /** The server has answered whether a Sheet is connected. */
  known: boolean;
  /** The connection's state; null when there is none. */
  status: 'active' | 'reauthorize' | null;
  /** The person said "not now" on this phone. */
  skipped: boolean;
  /** Workouts saved so far, holidays and empty days aside. */
  savedWorkouts: number;
  /** On a workout or the first-run guide, where nothing may interrupt. */
  inWorkout: boolean;
}

/**
 * Whether to offer the Google Sheet. It is a mirror of the log, never a
 * gate: nobody is asked before their first saved workout (there is nothing
 * to mirror yet, and it would stand between a new person and the app), nor
 * in the middle of one. 'renew' keeps the existing notice for a lapsed grant.
 */
export function sheetOffer(input: SheetOfferInput): 'renew' | 'offer' | 'none' {
  if (input.status === 'reauthorize') return 'renew';
  if (input.status === 'active' || !input.known || input.skipped) return 'none';
  if (input.savedWorkouts === 0 || input.inWorkout) return 'none';
  return 'offer';
}
