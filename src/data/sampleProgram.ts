import type { Program } from '@/types';

export const samplePrograms: Omit<Program, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Upper 1',
    order: 1,
    exercises: [
      { id: 'smith_machine', name: 'Smith Machine', defaultSets: 1, defaultWeight: 45, defaultReps: 5, isActive: true },
      { id: 'lateral_on', name: 'Lateral Ön', defaultSets: 1, defaultWeight: 35, defaultReps: 6, isActive: true },
      { id: 'lateral_arka', name: 'Lateral Arka', defaultSets: 1, defaultWeight: 35, defaultReps: 6, isActive: true },
      { id: 'triceps_long', name: 'Triceps Long Head', defaultSets: 1, defaultWeight: 63, defaultReps: 8, isActive: true },
      { id: 'triceps_short', name: 'Triceps Short Head', defaultSets: 1, defaultWeight: 70, defaultReps: 6, isActive: true },
      { id: 'pec_fly', name: 'Pec Fly', defaultSets: 1, defaultWeight: 81, defaultReps: 8, isActive: true },
      { id: 't_bar_row', name: 'T Bar Row', defaultSets: 2, defaultWeight: 77.5, defaultReps: 8, isActive: true },
      { id: 'single_arm_pulldown', name: 'Single Arm Pulldown', defaultSets: 2, defaultWeight: 0, defaultReps: 0, isActive: true },
      { id: 'shoulder_press', name: 'Shoulder Press', defaultSets: 1, defaultWeight: 57.5, defaultReps: 8, isActive: true },
      { id: 'biceps_long', name: 'Biceps Long Head', defaultSets: 1, defaultWeight: 25, defaultReps: 8, isActive: true },
      { id: 'biceps_short', name: 'Biceps Short Head', defaultSets: 1, defaultWeight: 54, defaultReps: 6, isActive: true },
    ],
  },
  {
    name: 'Lower 1',
    order: 2,
    exercises: [
      { id: 'squat', name: 'Squat', defaultSets: 2, defaultWeight: 80, defaultReps: 6, isActive: true },
      { id: 'leg_press', name: 'Leg Press', defaultSets: 2, defaultWeight: 150, defaultReps: 8, isActive: true },
      { id: 'rdl', name: 'Romanian Deadlift', defaultSets: 2, defaultWeight: 70, defaultReps: 8, isActive: true },
      { id: 'leg_curl', name: 'Leg Curl', defaultSets: 2, defaultWeight: 50, defaultReps: 10, isActive: true },
      { id: 'leg_extension', name: 'Leg Extension', defaultSets: 2, defaultWeight: 60, defaultReps: 10, isActive: true },
      { id: 'calf_raise', name: 'Calf Raise', defaultSets: 2, defaultWeight: 80, defaultReps: 12, isActive: true },
    ],
  },
  {
    name: 'Upper 2',
    order: 3,
    exercises: [
      { id: 'bench_press', name: 'Bench Press', defaultSets: 2, defaultWeight: 70, defaultReps: 6, isActive: true },
      { id: 'incline_db', name: 'Incline Dumbbell Press', defaultSets: 2, defaultWeight: 28, defaultReps: 8, isActive: true },
      { id: 'cable_fly', name: 'Cable Fly', defaultSets: 2, defaultWeight: 15, defaultReps: 12, isActive: true },
      { id: 'lat_pulldown', name: 'Lat Pulldown', defaultSets: 2, defaultWeight: 65, defaultReps: 8, isActive: true },
      { id: 'seated_row', name: 'Seated Row', defaultSets: 2, defaultWeight: 60, defaultReps: 8, isActive: true },
      { id: 'face_pull', name: 'Face Pull', defaultSets: 2, defaultWeight: 25, defaultReps: 15, isActive: true },
    ],
  },
  {
    name: 'Upper 3',
    order: 4,
    exercises: [
      { id: 'lateral_raise_u3', name: 'Lateral Raise', defaultSets: 2, defaultWeight: 12, defaultReps: 12, isActive: true },
      { id: 'rear_delt_fly', name: 'Rear Delt Fly', defaultSets: 2, defaultWeight: 14, defaultReps: 12, isActive: true },
      { id: 'hammer_curl', name: 'Hammer Curl', defaultSets: 2, defaultWeight: 14, defaultReps: 10, isActive: true },
      { id: 'triceps_pushdown', name: 'Triceps Pushdown', defaultSets: 2, defaultWeight: 30, defaultReps: 10, isActive: true },
      { id: 'cable_curl', name: 'Cable Curl', defaultSets: 2, defaultWeight: 20, defaultReps: 12, isActive: true },
      { id: 'overhead_extension', name: 'Overhead Triceps Extension', defaultSets: 2, defaultWeight: 25, defaultReps: 10, isActive: true },
    ],
  },
  {
    name: 'Lower 2',
    order: 5,
    exercises: [
      { id: 'hip_thrust', name: 'Hip Thrust', defaultSets: 2, defaultWeight: 100, defaultReps: 8, isActive: true },
      { id: 'bulgarian_split', name: 'Bulgarian Split Squat', defaultSets: 2, defaultWeight: 20, defaultReps: 8, isActive: true },
      { id: 'leg_curl_l2', name: 'Lying Leg Curl', defaultSets: 2, defaultWeight: 45, defaultReps: 10, isActive: true },
      { id: 'hack_squat', name: 'Hack Squat', defaultSets: 2, defaultWeight: 80, defaultReps: 8, isActive: true },
      { id: 'adductor', name: 'Adductor Machine', defaultSets: 2, defaultWeight: 60, defaultReps: 12, isActive: true },
      { id: 'calf_seated', name: 'Seated Calf Raise', defaultSets: 2, defaultWeight: 40, defaultReps: 15, isActive: true },
    ],
  },
];
