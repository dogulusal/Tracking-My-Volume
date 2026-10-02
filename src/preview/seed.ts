import { initialState } from '@/context/appReducer';
import { samplePrograms } from '@/data/sampleProgram';
import type { AppState, Intensity, Program, WeekLog } from '@/types';

// Preview builds only: seven weeks of made-up workouts on the sample program,
// so a design can be tried before importing a real export. Deterministic, so
// every phone sees the same numbers.
export function makeSampleState(): AppState {
  const now = new Date().toISOString();
  const programs: Program[] = samplePrograms.map((program, index) => ({
    ...program,
    id: `ornek-${index + 1}`,
    createdAt: now,
    updatedAt: now,
  }));

  let seed = 7;
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const weeks = 7;
  const start = new Date('2026-08-17');
  const weekLogs: WeekLog[] = [];
  programs.forEach((program, programIndex) => {
    for (let week = 0; week < weeks; week++) {
      const date = new Date(start);
      date.setDate(date.getDate() + week * 7 + programIndex);
      weekLogs.push({
        id: `ornek-log-${program.id}-${week}`,
        weekNumber: week,
        programId: program.id,
        date: date.toISOString().slice(0, 10),
        notes: '',
        isHoliday: false,
        updatedAt: date.toISOString(),
        exercises: program.exercises.map(exercise => {
          const r = random();
          const bump = Math.floor(week * (0.6 + r * 0.5));
          const weight = (exercise.defaultWeight || 20) + (r > 0.8 && week > 3 ? -2.5 : Math.floor(bump / 2) * 2.5);
          const reps = Math.max(4, (exercise.defaultReps || 8) + (bump % 2) - (r < 0.15 ? 1 : 0));
          return {
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            sets: Array.from({ length: exercise.defaultSets }, (_, setIndex) => ({
              weight,
              reps: reps - setIndex,
              intensity: (setIndex === 0 ? 'rir1' : 'failure') as Intensity,
            })),
          };
        }),
      });
    }
  });

  return {
    ...initialState,
    programs,
    plans: [{ id: 'ornek-plan', name: 'Örnek plan', programIds: programs.map(p => p.id), createdAt: now, updatedAt: now }],
    activePlanId: 'ornek-plan',
    weekLogs,
    currentWeek: weeks,
  };
}
