import { exerciseKey } from '@/utils/muscleGroups';

// Finer than the muscle groups the charts count volume by: the part of the
// muscle a movement works most, the way lifters name it (side vs front
// delts, upper chest, lats vs mid back).
export const REGIONS = [
  'Üst göğüs', 'Göğüs',
  'Ön omuz', 'Yan omuz', 'Arka omuz',
  'Kanat', 'Orta sırt', 'Trapez', 'Bel',
  'Biceps', 'Ön kol', 'Triceps',
  'Ön bacak', 'Arka bacak', 'Kalça', 'İç bacak', 'Dış kalça', 'Baldır',
  'Karın',
] as const;
export type Region = typeof REGIONS[number];

// What each region is, in a few words, for someone who does not know the term.
export const REGION_HINTS: Partial<Record<Region, string>> = {
  'Kanat': 'sırtın genişliği (latissimus)',
  'Orta sırt': 'kürek kemikleri arası',
  'Ön bacak': 'uyluğun önü (quadriceps)',
  'Arka bacak': 'uyluğun arkası (hamstring)',
  'Kalça': 'kalça kasları (glute)',
};

// First match wins, so a movement is caught by its most specific words
// before the general ones: "leg curl" is not biceps, "incline curl" is not
// upper chest, "lateral arka" is not side delts. The first region listed is
// the one worked most; the rest also work.
const RULES: [RegExp, Region[]][] = [
  [/calf|kalf|baldir/, ['Baldır']],
  [/crunch|karin|\babs?\b|plank|leg raise|sit ?up|ab wheel/, ['Karın']],
  [/leg curl|lying curl|seated curl|nordic|hamstring/, ['Arka bacak']],
  [/romanian|\brdl\b|stiff|good ?morning/, ['Arka bacak', 'Kalça', 'Bel']],
  [/deadlift/, ['Arka bacak', 'Kalça', 'Bel', 'Trapez']],
  [/hip thrust|glute|kalca/, ['Kalça', 'Arka bacak']],
  [/adduct/, ['İç bacak']],
  [/abduct/, ['Dış kalça']],
  [/leg ext/, ['Ön bacak']],
  [/squat|leg press|hack|lunge|split|step ?up/, ['Ön bacak', 'Kalça']],
  [/tricep|pushdown|push down|skull|french|kickback|close grip/, ['Triceps']],
  [/hammer/, ['Biceps', 'Ön kol']],
  [/bicep|curl|preacher/, ['Biceps']],
  [/wrist|forearm|on kol/, ['Ön kol']],
  [/lateral (on|front)|front raise|on omuz/, ['Ön omuz']],
  [/lateral arka|rear delt|reverse (pec|fly)|face ?pull|arka omuz/, ['Arka omuz', 'Orta sırt']],
  [/upright/, ['Yan omuz', 'Trapez']],
  [/lateral|side raise|yan omuz/, ['Yan omuz']],
  [/shoulder press|military|\bohp\b|overhead press|arnold|omuz/, ['Ön omuz', 'Yan omuz', 'Triceps']],
  [/shrug|trap/, ['Trapez']],
  [/pulldown|pull ?up|\bchin|\blatt?\b|pullover|kanat/, ['Kanat', 'Biceps']],
  [/row|t ?bar|sirt/, ['Orta sırt', 'Kanat', 'Arka omuz']],
  [/back ext|hyperext|\bbel\b/, ['Bel', 'Kalça']],
  [/incline|ust gogus/, ['Üst göğüs', 'Ön omuz', 'Triceps']],
  [/\bdips?\b/, ['Göğüs', 'Triceps']],
  [/pec|chest|gogus|bench|decline|\bfly\b|flye|push ?up|press/, ['Göğüs', 'Ön omuz', 'Triceps']],
];

// Rules are written without Turkish letters, so names are folded to match.
const fold = (name: string) => exerciseKey(name)
  .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');

/**
 * The regions a movement works, the main one first: the one picked by hand
 * when there is one, else what its name says; empty when the name says
 * nothing ("Smith Machine").
 */
export function muscleRegions(name: string, chosen?: string): Region[] {
  if (chosen && (REGIONS as readonly string[]).includes(chosen)) return [chosen as Region];
  const key = fold(name);
  return RULES.find(([pattern]) => pattern.test(key))?.[1] ?? [];
}
