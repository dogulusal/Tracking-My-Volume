/**
 * Complete workout data parsed from the user's PDF spreadsheet.
 * Contains two mezo cycles:
 * - Mezo 1: weeks 0-14 (complete)
 * - Mezo 2: weeks 15-19 (in progress)
 */
import type { Program, WeekLog, SetLog, ExerciseLog, Intensity } from '@/types';

// ─── Helper: Parse compact notation ───────────────────
// Format: "45x5F" or "45x5" or "45x5F|45x4F" (pipe separates sets)
function parseEntry(entry: string): SetLog[] {
  if (!entry || entry === '-' || entry === '0x0') return [];
  const sets = entry.split('|').map(s => s.trim());
  let lastWeight = 0;

  return sets.map(s => {
    const isFailure = s.toUpperCase().includes('F');
    // Detect RIR notation: +1 = rir1, +2 = rir2, +3 = rir3
    const rirMatch = s.match(/\+(\d+)/);
    const rirLevel = rirMatch ? parseInt(rirMatch[1], 10) : 0;
    // Remove F, +N markers, extra whitespace
    const cleaned = s.replace(/F/gi, '').replace(/\+\d+/g, '').replace(/\s+/g, '').trim();
    const match = cleaned.match(/([\d.,]+)x([\d.,]+)/);
    const toIntensity = (failure: boolean, rir: number): Intensity => {
      if (failure) return 'failure';
      if (rir === 1) return 'rir1';
      if (rir === 3) return 'rir3';
      return 'rir2';
    };
    if (match) {
      lastWeight = parseFloat(match[1].replace(',', '.'));
      const reps = Math.round(parseFloat(match[2].replace(',', '.')));
      return { weight: lastWeight, reps, intensity: toIntensity(isFailure, rirLevel) };
    }
    // If only reps (e.g., "4F" in "45x5F|4F"), use lastWeight
    const repsOnly = cleaned.replace(/[^0-9.,]/g, '');
    if (repsOnly) {
      const reps = Math.round(parseFloat(repsOnly.replace(',', '.')));
      return { weight: lastWeight, reps, intensity: toIntensity(isFailure, rirLevel) };
    }
    return { weight: 0, reps: 0, intensity: 'failure' as Intensity };
  }).filter(s => s.reps > 0);
}

// ─── Programs ─────────────────────────────────────────
// Based on the latest mezo cycle (pages 4-5 of PDF)

export const pdfPrograms: Program[] = [
  {
    id: 'upper1',
    name: 'Upper 1',
    order: 1,
    exercises: [
      { id: 'u1_smith', name: 'Smith Machine', defaultSets: 1, defaultWeight: 45, defaultReps: 6, isActive: true },
      { id: 'u1_lateral_on', name: 'Lateral Ön', defaultSets: 1, defaultWeight: 40, defaultReps: 10, isActive: true },
      { id: 'u1_triceps_long', name: 'Triceps Long Head', defaultSets: 1, defaultWeight: 58.5, defaultReps: 9, isActive: true },
      { id: 'u1_triceps_short', name: 'Triceps Short Head', defaultSets: 1, defaultWeight: 68, defaultReps: 9, isActive: true },
      { id: 'u1_pec_fly', name: 'Pec Fly', defaultSets: 1, defaultWeight: 88, defaultReps: 9, isActive: true },
      { id: 'u1_tbar_row', name: 'T Bar Row', defaultSets: 2, defaultWeight: 75, defaultReps: 8, isActive: true },
      { id: 'u1_single_arm_pull', name: 'Single Arm Pulldown', defaultSets: 2, defaultWeight: 42, defaultReps: 9, isActive: true },
      { id: 'u1_shoulder_press', name: 'Shoulder Press', defaultSets: 1, defaultWeight: 60, defaultReps: 7, isActive: true },
      { id: 'u1_biceps_long', name: 'Biceps Long Head', defaultSets: 1, defaultWeight: 17.5, defaultReps: 10, isActive: true },
      { id: 'u1_biceps_short', name: 'Biceps Short Head', defaultSets: 1, defaultWeight: 15, defaultReps: 9, isActive: true },
    ],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'lower1',
    name: 'Lower 1',
    order: 2,
    exercises: [
      { id: 'l1_adduction', name: 'Adduction Machine', defaultSets: 2, defaultWeight: 30, defaultReps: 13, isActive: true },
      { id: 'l1_leg_ext', name: 'Leg Extension', defaultSets: 2, defaultWeight: 10.25, defaultReps: 10, isActive: true },
      { id: 'l1_leg_curl', name: 'Leg Curl', defaultSets: 2, defaultWeight: 77.5, defaultReps: 10, isActive: true },
      { id: 'l1_hack_squat', name: 'Hack Squat', defaultSets: 2, defaultWeight: 101.25, defaultReps: 8, isActive: true },
      { id: 'l1_kalf', name: 'Kalf', defaultSets: 2, defaultWeight: 110, defaultReps: 12, isActive: true },
    ],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'upper2',
    name: 'Upper 2',
    order: 3,
    exercises: [
      { id: 'u2_pullup', name: 'Pull Up', defaultSets: 2, defaultWeight: 15, defaultReps: 10, isActive: true },
      { id: 'u2_lateral_on', name: 'Lateral Ön', defaultSets: 1, defaultWeight: 40, defaultReps: 10, isActive: true },
      { id: 'u2_machine_row', name: 'Machine Row', defaultSets: 2, defaultWeight: 75, defaultReps: 8, isActive: true },
      { id: 'u2_triceps_long', name: 'Triceps Long Head', defaultSets: 1, defaultWeight: 58.5, defaultReps: 10, isActive: true },
      { id: 'u2_triceps_short', name: 'Triceps Short Head', defaultSets: 1, defaultWeight: 68, defaultReps: 10, isActive: true },
      { id: 'u2_cable_row', name: 'Cable Row', defaultSets: 2, defaultWeight: 42, defaultReps: 9, isActive: true },
      { id: 'u2_biceps_short', name: 'Biceps Short Head', defaultSets: 1, defaultWeight: 15, defaultReps: 9, isActive: true },
      { id: 'u2_biceps_long', name: 'Biceps Long Head', defaultSets: 1, defaultWeight: 17.5, defaultReps: 10, isActive: true },
      { id: 'u2_flat_press', name: 'Flat Press', defaultSets: 2, defaultWeight: 61.25, defaultReps: 8, isActive: true },
    ],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'upper3',
    name: 'Upper 3',
    order: 4,
    exercises: [
      { id: 'u3_shoulder_press', name: 'Shoulder Press', defaultSets: 1, defaultWeight: 60, defaultReps: 10, isActive: true },
      { id: 'u3_lateral_on', name: 'Lateral Ön', defaultSets: 1, defaultWeight: 42.5, defaultReps: 8, isActive: true },
      { id: 'u3_biceps_long', name: 'Biceps Long Head', defaultSets: 1, defaultWeight: 20, defaultReps: 8, isActive: true },
      { id: 'u3_biceps_short', name: 'Biceps Short Head', defaultSets: 1, defaultWeight: 15, defaultReps: 10, isActive: true },
      { id: 'u3_incline', name: 'İncline Machine', defaultSets: 1, defaultWeight: 55, defaultReps: 7, isActive: true },
      { id: 'u3_latt_pulldown', name: 'Latt Pulldown', defaultSets: 2, defaultWeight: 93.5, defaultReps: 8, isActive: true },
      { id: 'u3_pec_fly', name: 'Pec Fly', defaultSets: 1, defaultWeight: 88, defaultReps: 8, isActive: true },
      { id: 'u3_low_row', name: 'Low Row', defaultSets: 2, defaultWeight: 55, defaultReps: 9, isActive: true },
      { id: 'u3_kelso', name: 'Kelso Shrug', defaultSets: 1, defaultWeight: 65, defaultReps: 10, isActive: true },
      { id: 'u3_rear_delt', name: 'Rear Delt', defaultSets: 1, defaultWeight: 86, defaultReps: 9, isActive: true },
      { id: 'u3_triceps_long', name: 'Triceps Long Head', defaultSets: 1, defaultWeight: 61, defaultReps: 10, isActive: true },
      { id: 'u3_triceps_short', name: 'Triceps Short Head', defaultSets: 1, defaultWeight: 68, defaultReps: 10, isActive: true },
    ],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'lower2',
    name: 'Lower 2',
    order: 5,
    exercises: [
      { id: 'l2_adduction', name: 'Adduction Machine', defaultSets: 2, defaultWeight: 30, defaultReps: 12, isActive: true },
      { id: 'l2_rdl', name: 'RDL', defaultSets: 2, defaultWeight: 137.5, defaultReps: 8, isActive: true },
      { id: 'l2_leg_ext', name: 'Leg Extension', defaultSets: 2, defaultWeight: 10.25, defaultReps: 10, isActive: true },
      { id: 'l2_hack_squat', name: 'Hack Squat', defaultSets: 2, defaultWeight: 73.75, defaultReps: 9, isActive: true },
      { id: 'l2_kalf', name: 'Kalf', defaultSets: 2, defaultWeight: 110, defaultReps: 11, isActive: true },
    ],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

// ─── Raw Week Data (Compact Format) ──────────────────
// Key: exerciseId → value: "weight x reps [F] [| weight x reps F]"

type WeekData = Record<string, string>;

// MEZO 1: Upper 1 (Weeks 0-14)
const upper1Weeks: WeekData[] = [
  // H0 (base)
  { u1_smith: '45x5', u1_lateral_on: '35x6', u1_lateral_arka: '35x6', u1_triceps_long: '63x8', u1_triceps_short: '70x6', u1_pec_fly: '81x8', u1_tbar_row: '77.5x8', u1_single_arm_pull: '0x0', u1_shoulder_press: '57.5x8', u1_biceps_long: '25x8', u1_biceps_short: '54x6' },
  // H1
  { u1_smith: '45x5F', u1_lateral_on: '35x5F', u1_lateral_arka: '35x5F', u1_triceps_long: '63x8F', u1_triceps_short: '70x8F', u1_pec_fly: '81x8|81x11F', u1_tbar_row: '70x6F', u1_single_arm_pull: '0x0', u1_shoulder_press: '57.5x6F', u1_biceps_long: '25x8F', u1_biceps_short: '54x6F' },
  // H2
  { u1_smith: '45x5F|45x4F', u1_lateral_on: '35x6F', u1_lateral_arka: '35x4F', u1_triceps_long: '63x7F', u1_triceps_short: '70x6F', u1_pec_fly: '88x9F|88x9.5F', u1_tbar_row: '70x8F', u1_single_arm_pull: '28x7F|28x8F', u1_shoulder_press: '57.5x7F|57.5x8F', u1_biceps_long: '25x10F', u1_biceps_short: '60x9F' },
  // H3
  { u1_smith: '45x4F|45x5F', u1_lateral_on: '35x8F', u1_lateral_arka: '35x5F', u1_triceps_long: '63x5F', u1_triceps_short: '70x6F', u1_pec_fly: '88x8F', u1_tbar_row: '72.5x6F|72.5x7F', u1_single_arm_pull: '28x9F|28x10F', u1_shoulder_press: '57.5x8F', u1_biceps_long: '30x10F', u1_biceps_short: '54x7' },
  // H4
  { u1_smith: '45x5F', u1_lateral_on: '35x8F', u1_lateral_arka: '35x5.5F', u1_triceps_long: '63x7F', u1_triceps_short: '63x5F', u1_pec_fly: '75x8F', u1_tbar_row: '72.5x8F', u1_single_arm_pull: '35x10F|35x8F', u1_shoulder_press: '58.75x7F', u1_biceps_long: '35x7F', u1_biceps_short: '54x7F' },
  // H5
  { u1_smith: '45x5F', u1_lateral_on: '35x9F', u1_lateral_arka: '35x7F', u1_triceps_long: '63x6F', u1_triceps_short: '63x8F', u1_pec_fly: '81x7F', u1_tbar_row: '73.75x8F', u1_single_arm_pull: '42x7F|42x6F', u1_shoulder_press: '58.75x8F', u1_biceps_long: '40x6F', u1_biceps_short: '54x7F' },
  // H6
  { u1_smith: '45x6F', u1_lateral_on: '37.5x6F', u1_lateral_arka: '35x8F', u1_triceps_long: '63x7F', u1_triceps_short: '63x10F', u1_pec_fly: '81x11F', u1_tbar_row: '73.75x9F|73.75x8F', u1_single_arm_pull: '42x8F|42x7F', u1_shoulder_press: '58.75x8F', u1_biceps_long: '40x6F', u1_biceps_short: '54x8F' },
  // H7
  { u1_smith: '45x6F', u1_lateral_on: '37.5x6F', u1_lateral_arka: '35x8F', u1_triceps_long: '63x10F', u1_triceps_short: '65.5x9F', u1_pec_fly: '83.5x8F', u1_tbar_row: '73.75x9F|73.75x8F', u1_single_arm_pull: '42x8F|42x7F', u1_shoulder_press: '58.75x9F', u1_biceps_long: '40x6', u1_biceps_short: '54x8F' },
  // H8
  { u1_smith: '45x6F', u1_lateral_on: '37.5x7F', u1_lateral_arka: '35x8F', u1_triceps_long: '65.5x8F', u1_triceps_short: '65.5x12F', u1_pec_fly: '83.5x10F', u1_tbar_row: '73.75x9F|73.75x8F', u1_single_arm_pull: '42x8F', u1_shoulder_press: '58.75x9F', u1_biceps_long: '40x6F', u1_biceps_short: '54x9F' },
  // H9
  { u1_smith: '45x6F', u1_lateral_on: '37.5x6F', u1_lateral_arka: '35x7F', u1_triceps_long: '65.5x8F', u1_triceps_short: '66.5x8F', u1_pec_fly: '84.75x9F', u1_tbar_row: '73.75x9F|73.75x8F', u1_single_arm_pull: '42x8F', u1_shoulder_press: '58.75x9F', u1_biceps_long: '40x6F', u1_biceps_short: '15x7F' },
  // H10 (tatil)
  {},
  // H11
  { u1_smith: '45x6F', u1_lateral_on: '37.5x8F', u1_triceps_long: '42x8F', u1_triceps_short: '50x10F', u1_pec_fly: '86x8F', u1_tbar_row: '73.75x10F', u1_single_arm_pull: '42x8F', u1_shoulder_press: '58.75x9F', u1_biceps_long: '15x10F', u1_biceps_short: '15x9F' },
  // H12
  { u1_smith: '45x6F', u1_lateral_on: '37.5x8F', u1_triceps_long: '51.5x10F', u1_triceps_short: '61x10F', u1_pec_fly: '86x11F', u1_tbar_row: '75x8F', u1_single_arm_pull: '42x9F|42x8F', u1_shoulder_press: '60x7F', u1_biceps_long: '17.5x8F', u1_biceps_short: '15x9F' },
  // H13
  { u1_smith: '45x6F', u1_lateral_on: '40x9F', u1_triceps_long: '58.5x9F', u1_triceps_short: '68x9F', u1_pec_fly: '88x9F', u1_tbar_row: '75x8F', u1_single_arm_pull: '42x9F|42x8F', u1_shoulder_press: '60x7F', u1_biceps_long: '17.5x10F', u1_biceps_short: '15x9F' },
  // H14
  { u1_smith: '45x6F', u1_lateral_on: '40x10F|40x9F', u1_triceps_long: '58.5x9F', u1_triceps_short: '68x9F', u1_pec_fly: '88x9F', u1_tbar_row: '75x8F', u1_single_arm_pull: '42x9F|42x8F', u1_shoulder_press: '60x7F', u1_biceps_long: '17.5x10F', u1_biceps_short: '15x9F' },
];

// MEZO 1: Lower 1 (Weeks 0-14)
const lower1Weeks: WeekData[] = [
  // H0
  { l1_adduction: '17.5x8', l1_leg_ext: '9x8', l1_leg_curl: '75x6', l1_smith_squat: '50x6', l1_leg_press: '6x6', l1_kalf: '50x10' },
  // H1
  { l1_adduction: '17.5x8', l1_leg_ext: '9x9', l1_leg_curl: '77.5x7', l1_smith_squat: '50x6', l1_leg_press: '6x6', l1_kalf: '50x10' },
  // H2
  { l1_adduction: '17.5x11F', l1_leg_ext: '9.25x9F|9.25x8F', l1_leg_curl: '77.5x8F|77.5x7.5F', l1_smith_squat: '50x6F', l1_leg_press: '6x6', l1_kalf: '50x10F' },
  // H3
  { l1_adduction: '20x11F|20x12F', l1_leg_ext: '10x8F', l1_leg_curl: '77.5x8F', l1_smith_squat: '50x6.5|50x7F', l1_leg_press: '6x8F', l1_kalf: '50x12F|50x11F' },
  // H4
  { l1_adduction: '22.5x12F', l1_leg_ext: '10x10F|10x9F', l1_leg_curl: '77.5x9F|77.5x8F', l1_smith_squat: '50x8F|50x7F', l1_leg_press: '6x8', l1_kalf: '50x13F' },
  // H5
  { l1_adduction: '25x13F', l1_leg_ext: '10.25x8F', l1_leg_curl: '77.5x9F|77.5x8F', l1_smith_squat: '50x8F|50x8F', l1_leg_press: '7x6', l1_kalf: '52.5x12F|52.5x11F' },
  // H6
  { l1_adduction: '25x13F|25x11F', l1_leg_ext: '10.25x8F', l1_leg_curl: '77.5x9F', l1_smith_squat: '51.25x7F|51.25x6F', l1_leg_press: '7x8F', l1_kalf: '52.5x13F' },
  // H7
  { l1_adduction: '25x14F|25x13F', l1_leg_ext: '10.25x9F|10.25x8F', l1_leg_curl: '77.5x9F|77.5x9F', l1_smith_squat: '51.25x8F', l1_leg_press: '7x9F', l1_kalf: '52.5x14F|52.5x13F' },
  // H8
  { l1_adduction: '25x15F|25x12F', l1_leg_ext: '10.25x9F', l1_leg_curl: '77.5x9F|77.5x9F', l1_smith_squat: '51.25x8F', l1_leg_press: '7x9F', l1_kalf: '52.5x14F' },
  // H9
  { l1_adduction: '27.5x12F', l1_leg_ext: '10.25x9F|10.25x9F', l1_leg_curl: '77.5x10F|77.5x9F', l1_smith_squat: '51.25x8F|51.25x8F', l1_kalf: '53.75x12F|53.75x15F' },
  // H10
  { l1_adduction: '27.5x12F', l1_leg_ext: '10.25x9F|10.25x9F', l1_leg_curl: '77.5x10F|77.5x9F', l1_smith_squat: '51.25x8F|51.25x8F', l1_kalf: '53.75x12F|53.75x15F' },
  // H11
  { l1_adduction: '27.5x14F|27.5x12F', l1_leg_ext: '10.25x9F', l1_leg_curl: '77.5x9F', l1_smith_squat: '101.25x8F', l1_kalf: '107.5x12F' },
  // H12
  { l1_adduction: '27.5x15F|27.5x12F', l1_leg_ext: '10.25x10F', l1_leg_curl: '77.5x10F|77.5x9F', l1_smith_squat: '101.25x8F', l1_kalf: '107.5x12F' },
  // H13
  { l1_adduction: '27.5x15F|27.5x14F', l1_leg_ext: '10.25x10F', l1_leg_curl: '77.5x10F|77.5x9F', l1_smith_squat: '101.25x8F', l1_kalf: '107.5x13F' },
  // H14 (PDF'ye göre güncellendi)
  { l1_adduction: '30x13F', l1_leg_ext: '10.25x10F', l1_leg_curl: '77.5x10F|77.5x9F', l1_smith_squat: '101.25x8F', l1_leg_press: '', l1_kalf: '110x12F' },
];

// MEZO 1: Upper 2 (Weeks 0-14)
const upper2Weeks: WeekData[] = [
  // H0
  { u2_pullup: '15x6', u2_lateral_on: '35x6', u2_lateral_arka: '35x6', u2_machine_row: '67.5x6', u2_triceps_long: '63x8', u2_triceps_short: '70x6', u2_cable_row: '105x8', u2_biceps_short: '60x6', u2_biceps_long: '25x8', u2_flat_press: '20x6' },
  // H1
  { u2_pullup: '15x7', u2_lateral_on: '35x5F', u2_lateral_arka: '35x5F', u2_machine_row: '70x6', u2_triceps_long: '63x7', u2_triceps_short: '70x6', u2_cable_row: '105x8', u2_biceps_short: '60x7', u2_biceps_long: '25x10', u2_flat_press: '81x8' },
  // H2
  { u2_pullup: '15x7F', u2_lateral_on: '35x6F', u2_lateral_arka: '35x4F', u2_machine_row: '70x7', u2_triceps_long: '63x5F', u2_triceps_short: '70x5F', u2_cable_row: '105x9F', u2_biceps_short: '60x9F', u2_biceps_long: '30x10F', u2_flat_press: '81x9.5F|81x12F' },
  // H3
  { u2_pullup: '15x8F|15x7F', u2_lateral_on: '35x8F', u2_lateral_arka: '35x7F', u2_machine_row: '70x8', u2_triceps_long: '63x8F', u2_triceps_short: '70x3|56x8', u2_cable_row: '105x8.5F|105x9', u2_biceps_short: '54x7F', u2_biceps_long: '35x6F', u2_flat_press: '88x8F' },
  // H4
  { u2_pullup: '15x8F', u2_lateral_on: '35x8', u2_lateral_arka: '35x7F', u2_machine_row: '70x8', u2_triceps_long: '63x9F', u2_triceps_short: '63x9F', u2_cable_row: '105x10F|105x9F', u2_biceps_short: '54x7F', u2_biceps_long: '35x8F', u2_flat_press: '55x8F' },
  // H5
  { u2_pullup: '15x9F|15x8F', u2_lateral_on: '35x9F', u2_lateral_arka: '35x8F', u2_machine_row: '72.5x8F', u2_triceps_long: '63x10F', u2_triceps_short: '63x9F', u2_cable_row: '105x10F|105x9F', u2_biceps_short: '54x8F', u2_biceps_long: '40x6F', u2_flat_press: '55x8|55x8F' },
  // H6
  { u2_pullup: '15x9F|15x8F', u2_lateral_on: '37.5x6F', u2_lateral_arka: '35x8F', u2_machine_row: '72.5x8|72.5x9F', u2_triceps_long: '63x10F', u2_triceps_short: '63x10F', u2_cable_row: '105x10F|105x9F', u2_biceps_short: '54x8F', u2_biceps_long: '40x6F', u2_flat_press: '55x9F' },
  // H7
  { u2_pullup: '15x9F|15x8F', u2_lateral_on: '37.5x7F', u2_lateral_arka: '35x8F', u2_machine_row: '73.75x7F', u2_triceps_long: '65.5x6F', u2_triceps_short: '65.5x8F', u2_cable_row: '105x10F|105x9F', u2_biceps_short: '54x8F', u2_biceps_long: '40x7F', u2_flat_press: '55x10F' },
  // H8
  { u2_pullup: '15x9F|15x8F', u2_lateral_on: '37.5x8F', u2_lateral_arka: '35x8F', u2_machine_row: '73.75x8F', u2_triceps_long: '65.5x9F', u2_triceps_short: '66.5x8F', u2_cable_row: '105x10F|105x9F', u2_biceps_short: '54x9F', u2_biceps_long: '40x6F', u2_flat_press: '55x10F' },
  // H9
  { u2_pullup: '15x9F|15x8F', u2_lateral_on: '37.5x8F', u2_lateral_arka: '35x8F', u2_machine_row: '73.5x8F|73.5x8', u2_triceps_long: '65.5x9F', u2_triceps_short: '66.5x8F', u2_cable_row: '42x8F', u2_biceps_short: '15x7F', u2_biceps_long: '40x7F', u2_flat_press: '57.5x8F' },
  // H10
  { u2_pullup: '15x9F|15x8F', u2_lateral_on: '37.5x8F', u2_lateral_arka: '35x8F', u2_machine_row: '73.5x8F|73.5x8', u2_triceps_long: '65.5x10F', u2_triceps_short: '66.5x8F', u2_cable_row: '42x8F|42x9F', u2_biceps_short: '15x8F', u2_biceps_long: '40x5F', u2_flat_press: '57.5x8F' },
  // H11
  { u2_pullup: '15x9F|15x7F', u2_lateral_on: '35x10F', u2_machine_row: '73.75x8F|73.75x9F', u2_triceps_long: '65.5x8F', u2_triceps_short: '66.5x8F', u2_cable_row: '42x9F', u2_biceps_short: '15x8F', u2_biceps_long: '15x8F', u2_flat_press: '57.5x10F|57.5x9F' },
  // H12
  { u2_pullup: '15x9F', u2_lateral_on: '37.5x8F|37.5x9F', u2_machine_row: '73.75x10F|73.75x9F', u2_triceps_long: '42x11F', u2_triceps_short: '54x8F', u2_cable_row: '42x9F', u2_biceps_short: '15x9F', u2_biceps_long: '15x9F', u2_flat_press: '60x8F' },
  // H13
  { u2_pullup: '15x9F', u2_lateral_on: '40x8F|40x10F', u2_machine_row: '73.75x10F', u2_triceps_long: '56x10F', u2_triceps_short: '68x8F', u2_cable_row: '42x9F', u2_biceps_short: '15x9F', u2_biceps_long: '17.5x9F', u2_flat_press: '60x10F|60x8F' },
  // H14 (PDF'ye göre güncellendi)
  { u2_pullup: '15x10F|15x9F', u2_lateral_on: '40x10F', u2_lateral_arka: '', u2_machine_row: '75x8F|75x9F', u2_triceps_long: '58.5x10F', u2_triceps_short: '68x10F', u2_cable_row: '42x9F', u2_biceps_short: '15x9F', u2_biceps_long: '17.5x10F', u2_flat_press: '61.25x8F' },
];

// MEZO 1: Upper 3 (Weeks 0-14)
const upper3Weeks: WeekData[] = [
  // H0
  { u3_shoulder_press: '57.5x8', u3_lateral_on: '35x6', u3_lateral_arka: '35x6', u3_biceps_long: '25x8', u3_biceps_short: '54x6', u3_incline: '45x5', u3_latt_pulldown: '91x8', u3_pec_fly: '81x8', u3_low_row: '50x8', u3_kelso: '82.5x8', u3_rear_delt: '81x8', u3_triceps_long: '63x8', u3_triceps_short: '70x6' },
  // H1
  { u3_shoulder_press: '57.5x8', u3_lateral_on: '35x6', u3_lateral_arka: '35x4F', u3_biceps_long: '25x9F', u3_biceps_short: '54x5F', u3_incline: '45x4.5F|45x5F', u3_latt_pulldown: '91x8F', u3_pec_fly: '81x8|81x11F', u3_low_row: '60x6F', u3_kelso: '75x6F', u3_rear_delt: '81x8F', u3_triceps_long: '63x8|63x7F', u3_triceps_short: '70x6F' },
  // H2
  { u3_shoulder_press: '57.5x8|57.5x9', u3_lateral_on: '35x8F', u3_lateral_arka: '36x6F', u3_biceps_long: '30x10F', u3_biceps_short: '54x6.75F', u3_incline: '45x5F|45x4F', u3_latt_pulldown: '91x8F', u3_pec_fly: '88x9F|88x9.5F', u3_low_row: '60x6.5F', u3_kelso: '75x8', u3_rear_delt: '81x8F', u3_triceps_long: '63x7F', u3_triceps_short: '70x6F' },
  // H3
  { u3_shoulder_press: '58.75x8F', u3_lateral_on: '35x8', u3_lateral_arka: '35x7F', u3_biceps_long: '35x8F', u3_biceps_short: '54x7F', u3_incline: '45x5F', u3_latt_pulldown: '91x8|91x9F', u3_pec_fly: '88x8F', u3_low_row: '60x6.5F', u3_kelso: '80x8F', u3_rear_delt: '81x8', u3_triceps_long: '63x7F', u3_triceps_short: '63x9F' },
  // H4
  { u3_shoulder_press: '58.75x10F', u3_lateral_on: '35x9', u3_lateral_arka: '35x8F', u3_biceps_long: '35x10F', u3_biceps_short: '54x8F', u3_incline: '45x5.5F', u3_latt_pulldown: '91x9F', u3_pec_fly: '75x10F', u3_low_row: '60x6F', u3_kelso: '60x8F|60x9F', u3_rear_delt: '81x10F', u3_triceps_long: '63x4F|56x6F', u3_triceps_short: '63x8F' },
  // H5
  { u3_shoulder_press: '60x8F', u3_lateral_on: '37.5x6F', u3_lateral_arka: '35x8F', u3_biceps_long: '40x6F', u3_biceps_short: '54x9F', u3_incline: '55x5F', u3_latt_pulldown: '91x9F', u3_pec_fly: '81x8F', u3_low_row: '50x6F|50x8F', u3_kelso: '60x8F', u3_rear_delt: '81x10F', u3_triceps_long: '63x6F', u3_triceps_short: '63x10F' },
  // H6
  { u3_shoulder_press: '60x8F', u3_lateral_on: '37.5x7F', u3_lateral_arka: '35x8F', u3_biceps_long: '40x6F', u3_biceps_short: '54x9F', u3_incline: '55x6F', u3_latt_pulldown: '91x9F', u3_pec_fly: '81x9F', u3_low_row: '50x8F|50x7F', u3_kelso: '60x8F', u3_rear_delt: '81x10F', u3_triceps_long: '63x10F', u3_triceps_short: '63x10F' },
  // H7
  { u3_shoulder_press: '60x9F', u3_lateral_on: '37.5x8F', u3_lateral_arka: '35x8F', u3_biceps_long: '40x7F', u3_biceps_short: '54x8F', u3_incline: '55x6F', u3_latt_pulldown: '91x9F|91x10F', u3_pec_fly: '83.5x8F', u3_low_row: '50x10F', u3_kelso: '60x10F', u3_rear_delt: '83.5x8F', u3_triceps_long: '65.5x8F', u3_triceps_short: '65.5x8F' },
  // H8
  { u3_shoulder_press: '60x9F', u3_lateral_on: '37.5x8F', u3_lateral_arka: '35x8F', u3_biceps_long: '40x7F', u3_biceps_short: '54x9F', u3_incline: '55x6F', u3_latt_pulldown: '91x10F', u3_pec_fly: '83.5x10F', u3_low_row: '51.25x8F', u3_kelso: '60x10F', u3_rear_delt: '83.5x10F', u3_triceps_long: '65.5x8F', u3_triceps_short: '65.5x8F' },
  // H9
  { u3_shoulder_press: '60x8F', u3_lateral_on: '37.5x8F', u3_lateral_arka: '35x8F', u3_biceps_long: '40x7F', u3_biceps_short: '15x8F', u3_incline: '55x6F', u3_latt_pulldown: '91x10F', u3_pec_fly: '84.75x12F', u3_low_row: '51.25x9F', u3_kelso: '61.25x10F', u3_rear_delt: '83.5x10F', u3_triceps_long: '65.5x8F', u3_triceps_short: '65.5x8F' },
  // H10
  { u3_shoulder_press: '60x8F', u3_lateral_on: '37.5x8F', u3_lateral_arka: '35x8F', u3_biceps_long: '40x7F', u3_biceps_short: '15x9F', u3_incline: '55x6F', u3_latt_pulldown: '92x8F', u3_pec_fly: '84.75x8F', u3_low_row: '51.25x9F', u3_kelso: '61.25x8F', u3_rear_delt: '84.75x8F', u3_triceps_long: '65.5x7F', u3_triceps_short: '65.5x8F' },
  // H11
  { u3_shoulder_press: '60x9F', u3_lateral_on: '37.5x8F', u3_biceps_long: '15x9F', u3_biceps_short: '15x9F', u3_incline: '55x6F', u3_latt_pulldown: '92x8F|92x9F', u3_pec_fly: '84.75x11F', u3_low_row: '51.25x10F', u3_kelso: '61.25x10F', u3_rear_delt: '84.75x10F', u3_triceps_long: '42x8F', u3_triceps_short: '50x10F' },
  // H12
  { u3_shoulder_press: '60x9F', u3_lateral_on: '37.5x10F', u3_biceps_long: '15x10F', u3_biceps_short: '15x10F', u3_incline: '55x7F', u3_latt_pulldown: '92x9F|92x10F', u3_pec_fly: '86x9F', u3_low_row: '52.5x10F', u3_kelso: '62.5x11F', u3_rear_delt: '86x8F', u3_triceps_long: '49x10F', u3_triceps_short: '54x12F' },
  // H13
  { u3_shoulder_press: '60x10F', u3_lateral_on: '40x9F', u3_biceps_long: '17.5x10F', u3_biceps_short: '15x10F', u3_incline: '55x7F', u3_latt_pulldown: '93.5x8F', u3_pec_fly: '88x8F', u3_low_row: '53.75x9F|53.75x10F', u3_kelso: '63.75x9F', u3_rear_delt: '86x8F', u3_triceps_long: '58.5x9F', u3_triceps_short: '68x8F' },
  // H14 (PDF'ye göre güncellendi)
  { u3_shoulder_press: '60x10F', u3_lateral_on: '42.5x8F', u3_lateral_arka: '', u3_biceps_long: '20x8F', u3_biceps_short: '15x10F', u3_incline: '55x7F', u3_latt_pulldown: '93.5x8F', u3_pec_fly: '88x8F', u3_low_row: '55x9F|55x10F', u3_kelso: '65x10F', u3_rear_delt: '86x9F', u3_triceps_long: '61x10F', u3_triceps_short: '68x10F' },
];

// MEZO 1: Lower 2 (Weeks 0-14)
const lower2Weeks: WeekData[] = [
  // H0
  { l2_adduction: '17.5x8', l2_rdl: '130x6', l2_leg_ext: '9x8', l2_hack_squat: '70x6', l2_leg_press: '6x6', l2_kalf: '50x10' },
  // H1
  { l2_adduction: '17.5x10F', l2_rdl: '130x6F', l2_leg_ext: '9.25x8F', l2_hack_squat: '70x7F', l2_leg_press: '6x6F', l2_kalf: '50x10F' },
  // H2
  { l2_adduction: '20x9F|20x10F', l2_rdl: '130x8F', l2_leg_ext: '9.25x10F|9.25x9F', l2_hack_squat: '70x7', l2_leg_press: '6x8F', l2_kalf: '50x12F' },
  // H3
  { l2_adduction: '22.5x14F', l2_rdl: '135x8F|135x6F', l2_leg_ext: '10x10F|10x8F', l2_hack_squat: '70x8F', l2_leg_press: '6x8', l2_kalf: '50x13F' },
  // H4
  { l2_adduction: '24.5x10F', l2_rdl: '135x6|135x7F', l2_leg_ext: '10.25x8F', l2_hack_squat: '71.25x7F', l2_leg_press: '7x6F', l2_kalf: '50x14F|50x12F' },
  // H5
  { l2_adduction: '25x13F|25x10F', l2_rdl: '135x8F', l2_leg_ext: '10.25x9F|10.25x8F', l2_hack_squat: '71.25x8F', l2_leg_press: '7x8F', l2_kalf: '52.5x12F' },
  // H6
  { l2_adduction: '25x13F|25x12F', l2_rdl: '135x8F|135x8', l2_leg_ext: '10.25x9F', l2_hack_squat: '71.25x8F', l2_leg_press: '7x8F', l2_kalf: '52.5x12F' },
  // H7
  { l2_adduction: '25x14F|25x12F', l2_rdl: '135x8|135x9F', l2_leg_ext: '10.25x9F', l2_hack_squat: '71.25x8F', l2_leg_press: '7x9', l2_kalf: '52.25x13F' },
  // H8
  { l2_adduction: '25x14F|25x12F', l2_rdl: '135x9F', l2_leg_ext: '10.25x9F', l2_hack_squat: '71.25x9F', l2_leg_press: '7x9', l2_kalf: '52.25x14F|52.25x13F' },
  // H9
  { l2_adduction: '25x15F|25x14F', l2_rdl: '135x9F', l2_leg_ext: '10.25x9F', l2_hack_squat: '72.5x8F', l2_kalf: '53.75x12F' },
  // H10
  { l2_adduction: '27.5x12F', l2_rdl: '135x9F', l2_leg_ext: '10.25x8F|10.25x10F', l2_hack_squat: '72.5x8F|72.5x9F', l2_kalf: '107.5x12F|107.5x11F' },
  // H11
  { l2_adduction: '27.5x14F|27.5x12F', l2_rdl: '137.5x7F', l2_leg_ext: '10.25x9F|10.25x10F', l2_hack_squat: '72.5x10F', l2_kalf: '107.5x12F' },
  // H12
  { l2_adduction: '27.5x15F|27.5x13F', l2_rdl: '137.5x7F|137.5x8F', l2_leg_ext: '10.25x10F', l2_hack_squat: '73.75x8F', l2_kalf: '107.5x13F' },
  // H14 (PDF'ye göre güncellendi)
  { l2_adduction: '30x12F', l2_rdl: '137.5x8F', l2_leg_ext: '10.25x10F', l2_hack_squat: '73.75x9F|73.75x10F', l2_leg_press: '', l2_kalf: '110x11F' },
];

// MEZO 2: Upper 1 (Weeks 15-19)
const upper1Mezo2: WeekData[] = [
  // H0 (week 15)
  { u1_smith: '45x6F', u1_lateral_on: '40x10F|40x9F', u1_triceps_long: '58.5x9F', u1_triceps_short: '68x9F', u1_pec_fly: '88x9F', u1_tbar_row: '75x8F', u1_single_arm_pull: '42x9F|42x8F', u1_shoulder_press: '60x7F', u1_biceps_long: '17.5x10F', u1_biceps_short: '15x9F' },
  // H1 (week 16)
  { u1_smith: '45x5F', u1_lateral_on: '42.5x8F|42.5x10F', u1_triceps_long: '63x10F', u1_triceps_short: '70.5x10F', u1_pec_fly: '88x10F', u1_tbar_row: '75x9F', u1_single_arm_pull: '42x9F', u1_shoulder_press: '60x7F', u1_biceps_long: '20x9F', u1_biceps_short: '15x10F' },
  // H2 (week 17)
  { u1_smith: '45x6F', u1_lateral_on: '45x9F|45x8F', u1_triceps_long: '66.5x8F', u1_triceps_short: '72.5x8F', u1_pec_fly: '88x12F', u1_tbar_row: '75x9F', u1_single_arm_pull: '56x8F', u1_shoulder_press: '60x8F', u1_biceps_long: '20x9F', u1_biceps_short: '17.5x8F' },
  // H3 (week 18)
  { u1_smith: '45x6F', u1_lateral_on: '45x10F', u1_triceps_long: '66.5x10F', u1_triceps_short: '72.5x10F', u1_pec_fly: '2.5x10F', u1_tbar_row: '75x8F', u1_single_arm_pull: '56x10F', u1_shoulder_press: '60x6F', u1_biceps_long: '20x9F', u1_biceps_short: '17.5x7F' },
  // H4 (week 19)
  { u1_smith: '45x6F', u1_lateral_on: '46x8F|46x8', u1_triceps_long: '70x9F', u1_triceps_short: '75x9F', u1_pec_fly: '2.5x9F', u1_tbar_row: '75x9F|75x8F', u1_single_arm_pull: '58.5x11F', u1_shoulder_press: '60x7F', u1_biceps_long: '20x10F', u1_biceps_short: '17.5x8F' },
];

// MEZO 2: Lower 1 (Weeks 15-18)
const lower1Mezo2: WeekData[] = [
  // H0 (week 15)
  { l1_adduction: '30x13F', l1_leg_ext: '10.25x10F', l1_leg_curl: '77.5x10F|77.5x9F', l1_hack_squat: '101.25x8F', l1_kalf: '110x12F' },
  // H1 (week 16)
  { l1_adduction: '30x14F|30x13F', l1_leg_ext: '10.25x10F', l1_leg_curl: '77.5x10F|77.5x9F', l1_hack_squat: '101.25x8F', l1_kalf: '110x14F|110x12F' },
  // H2 (week 17)
  { l1_adduction: '25x11F|25x10F', l1_leg_ext: '11.25x9F', l1_leg_curl: '77.5x10F|77.5x9F', l1_hack_squat: '101.25x8F', l1_kalf: '110x14F|110x12F' },
  // H3 (week 18)
  { l1_adduction: '25x13F|25x11F', l1_leg_ext: '11.25x10F', l1_leg_curl: '77.5x9F|77.5x8F', l1_hack_squat: '75x9F|75x10', l1_kalf: '110x15F|110x12F' },
  // H4 (week 19)
  { l1_adduction: '25x13F|11F', l1_leg_ext: '11.25x10F', l1_leg_curl: '77.5x9F|8F', l1_hack_squat: '75x9F|10+1', l1_kalf: '110x15F|110x12F' },
];

// MEZO 2: Upper 2 (Weeks 15-19)
const upper2Mezo2: WeekData[] = [
  // H0 (week 15)
  { u2_pullup: '15x10F|15x9F', u2_lateral_on: '40x10F', u2_machine_row: '75x8F|75x9F', u2_triceps_long: '58.5x10F', u2_triceps_short: '68x10F', u2_cable_row: '42x9F', u2_biceps_short: '15x9F', u2_biceps_long: '17.5x10F', u2_flat_press: '61.25x8F' },
  // H1 (week 16)
  { u2_pullup: '20x8F|20x7F', u2_lateral_on: '42.5x10F', u2_machine_row: '75x9F|75x10F', u2_triceps_long: '65.5x10F', u2_triceps_short: '70.5x10F', u2_cable_row: '42x10F', u2_biceps_short: '15x9F', u2_biceps_long: '20x9F', u2_flat_press: '61.25x8F|61.25x7F' },
  // H2 (week 17)
  { u2_pullup: '20x8F|20x7F', u2_lateral_on: '45x9F|45x8F', u2_machine_row: '75x9F|75x10F', u2_triceps_long: '66.5x10F', u2_triceps_short: '72.5x8F', u2_cable_row: '45.5x8F', u2_biceps_short: '15x9F', u2_biceps_long: '20x9F', u2_flat_press: '61.25x8F|61.25x7F' },
  // H3 (week 18)
  { u2_pullup: '20x8F', u2_lateral_on: '45x10F', u2_machine_row: '75x10F', u2_triceps_long: '70x8F', u2_triceps_short: '72.5x10F|72.5x9F', u2_cable_row: '45.5x8F|45.5x9F', u2_biceps_short: '17.5x8F', u2_biceps_long: '20x9F', u2_flat_press: '61.25x8F' },
  // H4 (week 19)
  { u2_pullup: '20x8F', u2_lateral_on: '46x10F|46x9F', u2_machine_row: '75x9F|75x8F', u2_triceps_long: '72.5x9F', u2_triceps_short: '75x10F', u2_cable_row: '45.5x9F', u2_biceps_short: '17.5x8F', u2_biceps_long: '20x10F', u2_flat_press: '61.25x8F' },
];

// MEZO 2: Upper 3 (Weeks 15-19)
const upper3Mezo2: WeekData[] = [
  // H0 (week 15)
  { u3_shoulder_press: '60x10F', u3_lateral_on: '42.5x8F', u3_biceps_long: '20x8F', u3_biceps_short: '15x10F', u3_incline: '55x7F', u3_latt_pulldown: '93.5x8F', u3_pec_fly: '88x8F', u3_low_row: '55x9F|55x10F', u3_kelso: '65x10F', u3_rear_delt: '86x9F', u3_triceps_long: '61x10F', u3_triceps_short: '68x10F' },
  // H1 (week 16)
  { u3_shoulder_press: '61.25x8F', u3_lateral_on: '45x8F', u3_biceps_long: '20x9F', u3_biceps_short: '17.5x7F', u3_incline: '55x7F', u3_latt_pulldown: '93.5x10F|93.5x9F', u3_pec_fly: '88x10F', u3_low_row: '57.5x8F', u3_kelso: '67.5x8F', u3_rear_delt: '86x10F', u3_triceps_long: '66.5x8F', u3_triceps_short: '72.5x8F' },
  // H2 (week 17)
  { u3_shoulder_press: '61.25x8F', u3_lateral_on: '45x10F', u3_biceps_long: '20x10F', u3_biceps_short: '17.5x7F', u3_incline: '55x7F', u3_latt_pulldown: '94.5x8F', u3_pec_fly: '2.5x8F', u3_low_row: '57.5x8F|57.5x9F', u3_kelso: '67.5x9F', u3_rear_delt: '88x8F', u3_triceps_long: '66.5x10F', u3_triceps_short: '72.5x10F' },
  // H3 (week 18)
  { u3_shoulder_press: '61.25x8F', u3_lateral_on: '46x8F', u3_biceps_long: '20x10F', u3_biceps_short: '17.5x7F', u3_incline: '55x6F', u3_latt_pulldown: '94.5x9F|94.5x8', u3_pec_fly: '2.5x9F', u3_low_row: '57.5x9F|57.5x10F', u3_kelso: '67.5x10F', u3_rear_delt: '88x8F', u3_triceps_long: '70x8F', u3_triceps_short: '75x9F' },
  // H4 (week 19)
  { u3_shoulder_press: '61.25x9F', u3_lateral_on: '46x10F', u3_biceps_long: '20x10F', u3_biceps_short: '17.5x8F', u3_incline: '55x6F', u3_latt_pulldown: '94.5x9F', u3_pec_fly: '88x8F', u3_low_row: '60x8F|60x9F', u3_kelso: '70x8F', u3_rear_delt: '88x8F', u3_triceps_long: '70x10F', u3_triceps_short: '75x10F' },
];

// MEZO 2: Lower 2 (Weeks 15-18)
const lower2Mezo2: WeekData[] = [
  // H0 (week 15)
  { l2_adduction: '30x12F', l2_rdl: '137.5x8F', l2_leg_ext: '10.25x10F', l2_leg_press: '73.75x9F|73.75x10F', l2_kalf: '110x11F' },
  // H1 (week 16)
  { l2_adduction: '25x11F', l2_rdl: '137.5x8|137.5x10F', l2_leg_ext: '11.5x9F', l2_leg_press: '75x8F', l2_kalf: '110x13F|110x12F' },
  // H2 (week 17)
  { l2_adduction: '25x12F|25x10F', l2_rdl: '140x8F', l2_leg_ext: '11.5x10F|11.5x9F', l2_leg_press: '110x8F', l2_kalf: '110x15F|110x12F' },
  // H3 (week 18)
  { l2_adduction: '25x12F|25x11F', l2_rdl: '140x8|140x8F', l2_leg_ext: '11.5x10F|11.5x9F', l2_leg_press: '110x8|110x9F', l2_kalf: '110x15F|110x14F' },
];

// ─── Weekly Notes ─────────────────────────────────────
const weeklyNotes: Record<string, Record<number, string>> = {
  upper1: {
    1: 'smith ikinci set hızlı girdiğim için çıkmamış olabilir, bicepsleri bir tık arttır',
    2: 'göğüs hacmini günlük 2 ye omuz pressi de 1 e düşürdüm pec flyda bilekten kaldırmaya başladım',
    3: 'lateral ve triceps haraketlerini ilk başta makinede yap kilo farkı oluyor öbür türlü pec flyı tek kolla yaptım tricepsler..',
    5: 'incline makinesini değiştiriyorum',
    8: 'biceps short head için benche dirseğimi yaslayarak single arm curl yapiyorum yine bazı haraketlerde omzum acıdığı için yapamadım',
    10: 'bayram',
    11: 'long ve tricepsleri solla başla önce ve long bicepsi de değiş',
    16: 'single arm pulldown bench 60 derece forma odaklan',
    17: 'pec flyda sol taraf daha ağır geldi ona dikkat et',
    18: 'pec fly hala soru işareti',
  },
  lower1: {
    1: 'leg extension 2.5 indir',
    2: 'adductionu haftaya 20 kilo gir extension eğer ikinci low günü de böyle gelirse arttır 10. deliğe',
    3: 'adduction için yukarıdan ağırlık indirme',
    6: 'kırmızı olmasının sebebi 3. haraket ve az dinlenerek yaptığım için muhtemelen',
    10: 'yazmayı unuttugum için aynısını kopyaladım',
    16: 'extension ve curl de belki 1 kilo ekleyebilirsin',
    17: 'adduction makinesi öne eğilerek. Smith squatı hack squat ile değiştirdim fakat çekim olduğu için bu antrenmanı yapamadım',
    18: 'leg extensionda 1.25 daha ekle',
    19: 'leg extensionda 1.25 daha ekle',
  },
  upper2: {
    1: 'pec flyda yeni makine denedim',
    2: 'lateral arka da ya ağırlık düş ya volume u düşür tricepste aynı şekilde biceps shortta solu önce gir ve ona göre bak pec flyda ağırlık arttır',
    3: 'machine row 72.5 gir triceps shortu 63 kilo gir pec fly bilekten tuttum ama çok iyi değildi form onu kontrol et',
    4: 'buradaki pec fly yerine flat press koydum',
    6: 'acelem olduğu için çok progress yapılmamış olabilir flat machine doluydu o yüzden incline da girdim',
    9: 'cable rowda single arm\'a geçtim, biceps shortta benche kol dayamalı single arm\'a geçtim',
    10: 'salondaki cuff kayboldu artık lateral machine geçtim formu incele long bicepste de dumbella geçtim',
    18: 'short head bicepste sol taraf ağır geldi',
  },
  upper3: {
    1: 'lateral arka ve biceps shortta bi ayar çek',
    2: 'smith itibariyle telefon görüşmeleri yapmam gerekti o yüzden biraz acele ettim ondan gri renkler',
    3: 'arka omuz hacmini 1 e düşürüp buraya 2 set kelso eklemeyi düşünüyorum',
    4: 'smith machine ve short tricepse bak low rowda ağırlık düş form odaklı git kelso 60 kilo iyiydi ağırlık arttır onda tricepste ısınmadan girdim belki ondan ağırlık düşmüştür haftaya buna dikkat et',
    5: 'low rowda koltuk 3 de iyi gibi sanki bidaha test et ayakların önde ve arkada olduğu durumlara da bir daha bak kelsoda ayaklar önde daha iyi gibi sanki',
    7: 'boynum ağrıdığı için kelso ve lateral yapamadım o yüzden kırmızı, low rowu da single arm denedim baya iyiydi',
    10: 'hızlı yapmaya calistim actim agalar vardi kötü performans',
    11: 'pec flyda + 5 kilo ekle, triceps overhead denedim 42x8 form odaklı 49 için güç var ama form bozuluyor dirseklere dikkat et dipste 50 x 10F biceps short 10 F zorladı baya dikkat et',
    16: 'pec fly da sağ kol 10 çıkmıştı ama sol çok zor 9 çıktı',
    17: 'pec fly da çift kol daha dik alttan tutarak yaptım',
  },
  lower2: {
    1: 'leg extension kilo arttır rdlde kilo arttır hack squatta öğren',
    3: 'RDL de o gün çok yorgundum o yüzden çıkmadığını düşünüyorum',
    6: 'leg press yapmayı galiba bugünle beraber bırakıyorum',
    7: 'leg pressi kaldırdım',
    16: 'adductionda sırtını yaslamadan yap haraket zorlaşıyor',
    17: 'hack squat yerine leg press yapmaya basladim',
  },
};

// ─── Build WeekLogs from raw data ─────────────────────

const holidayWeeks: Record<string, number[]> = {
  upper1: [10],
};

function buildWeekLogs(
  programId: string,
  weekDataArrays: { data: WeekData[]; startWeek: number }[],
  programExercises: Program['exercises']
): WeekLog[] {
  const logs: WeekLog[] = [];

  for (const { data, startWeek } of weekDataArrays) {
    data.forEach((weekData, index) => {
      const weekNumber = startWeek + index;
      const exercises: ExerciseLog[] = [];

      // Process each exercise in the week data
      for (const [exId, rawValue] of Object.entries(weekData)) {
        if (!rawValue || rawValue === '0x0') continue;
        const sets = parseEntry(rawValue);
        if (sets.length === 0) continue;

        // Find exercise name from program definition or use a readable name
        const exDef = programExercises.find(e => e.id === exId);
        const exerciseName = exDef?.name || exId.replace(/^[ul]\d_/, '').replace(/_/g, ' ');

        exercises.push({
          exerciseId: exId,
          exerciseName,
          sets,
        });
      }

      const notes = weeklyNotes[programId]?.[weekNumber] || '';

      if (exercises.length === 0) {
        if (!holidayWeeks[programId]?.includes(weekNumber)) return;

        logs.push({
          id: `${programId}_w${weekNumber}`,
          weekNumber,
          programId,
          date: calculateDate(weekNumber),
          exercises: [],
          notes,
          isHoliday: true,
          updatedAt: calculateDate(weekNumber),
        });
        return;
      }

      logs.push({
        id: `${programId}_w${weekNumber}`,
        weekNumber,
        programId,
        date: calculateDate(weekNumber),
        exercises,
        notes,
        isHoliday: false,
        updatedAt: calculateDate(weekNumber),
      });
    });
  }

  return logs;
}

// Calculate approximate dates (assuming weekly training starting from ~Jan 2024)
function calculateDate(weekNumber: number): string {
  const start = new Date('2024-09-01');
  start.setDate(start.getDate() + weekNumber * 7);
  return start.toISOString().split('T')[0];
}

// ─── Generate Complete Data ───────────────────────────

export function generatePdfImportData(): { programs: Program[]; weekLogs: WeekLog[]; currentWeek: number } {
  const allWeekLogs: WeekLog[] = [];

  // Upper 1
  allWeekLogs.push(...buildWeekLogs('upper1', [
    { data: upper1Weeks, startWeek: 0 },
    { data: upper1Mezo2, startWeek: 15 },
  ], pdfPrograms[0].exercises));

  // Lower 1
  allWeekLogs.push(...buildWeekLogs('lower1', [
    { data: lower1Weeks, startWeek: 0 },
    { data: lower1Mezo2, startWeek: 15 },
  ], pdfPrograms[1].exercises));

  // Upper 2
  allWeekLogs.push(...buildWeekLogs('upper2', [
    { data: upper2Weeks, startWeek: 0 },
    { data: upper2Mezo2, startWeek: 15 },
  ], pdfPrograms[2].exercises));

  // Upper 3
  allWeekLogs.push(...buildWeekLogs('upper3', [
    { data: upper3Weeks, startWeek: 0 },
    { data: upper3Mezo2, startWeek: 15 },
  ], pdfPrograms[3].exercises));

  // Lower 2
  allWeekLogs.push(...buildWeekLogs('lower2', [
    { data: lower2Weeks, startWeek: 0 },
    { data: lower2Mezo2, startWeek: 15 },
  ], pdfPrograms[4].exercises));

  return {
    programs: pdfPrograms,
    weekLogs: allWeekLogs,
    currentWeek: 19,
  };
}
