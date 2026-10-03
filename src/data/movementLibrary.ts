import { exerciseKey } from '@/utils/muscleGroups';

// Common gym movements, offered when a movement is added during a workout.
// Named the way gyms here say them: mostly English, as on the machines.
export const MOVEMENT_LIBRARY: readonly string[] = [
  // Göğüs
  'Bench Press', 'Incline Bench Press', 'Dumbbell Bench Press', 'Incline Dumbbell Press', 'Decline Bench Press',
  'Chest Press', 'Pec Fly', 'Cable Fly', 'Dips', 'Push Up',
  // Sırt
  'Lat Pulldown', 'Single Arm Pulldown', 'Pull Up', 'Chin Up', 'Seated Row', 'Cable Row', 'T Bar Row',
  'Barbell Row', 'Dumbbell Row', 'Pullover', 'Deadlift', 'Shrug',
  // Omuz
  'Shoulder Press', 'Dumbbell Shoulder Press', 'Military Press', 'Lateral Raise', 'Cable Lateral Raise',
  'Rear Delt Fly', 'Reverse Pec Deck', 'Face Pull', 'Upright Row', 'Front Raise', 'Arnold Press',
  // Kol
  'Biceps Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl', 'Incline Dumbbell Curl',
  'Triceps Pushdown', 'Overhead Triceps Extension', 'Skull Crusher', 'Close Grip Bench Press',
  // Bacak
  'Squat', 'Front Squat', 'Hack Squat', 'Smith Machine Squat', 'Leg Press', 'Romanian Deadlift',
  'Leg Curl', 'Seated Leg Curl', 'Leg Extension', 'Bulgarian Split Squat', 'Lunge', 'Hip Thrust',
  'Adductor', 'Abductor', 'Calf Raise', 'Seated Calf Raise',
  // Karın
  'Crunch', 'Cable Crunch', 'Leg Raise', 'Plank', 'Ab Wheel',
];

/**
 * Names for the "add a movement" search: the person's own movements first
 * (they are what they will pick most), then the library; one entry per
 * movement however it was typed. Every word of the query has to appear.
 */
export function searchMovements(query: string, own: readonly string[], limit = 12): { own: string[]; library: string[] } {
  const words = exerciseKey(query).split(' ').filter(Boolean);
  const matches = (name: string) => words.every(word => exerciseKey(name).includes(word));
  const seen = new Set<string>();
  const take = (names: readonly string[]) => names.filter(name => {
    const key = exerciseKey(name);
    if (!key || seen.has(key) || !matches(name)) return false;
    seen.add(key);
    return true;
  });
  const ownHits = take(own).slice(0, limit);
  const libraryHits = take(MOVEMENT_LIBRARY).slice(0, Math.max(0, limit - ownHits.length));
  return { own: ownHits, library: libraryHits };
}
