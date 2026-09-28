import type { PhaseDefinition } from '@/types';

export function normalizePhaseBoundaries(phases: PhaseDefinition[]): PhaseDefinition[] {
  if (!phases.length) throw new Error('En az bir faz gerekli.');
  const sorted = [...phases].sort((a, b) => a.startWeek - b.startWeek);
  if (sorted[0].startWeek !== 0) throw new Error('İlk faz toplam hafta 0’dan başlamalı.');
  const ids = new Set<string>();
  return sorted.map((phase, index) => {
    if (!phase.name.trim()) throw new Error('Her faza bir ad ver.');
    if (!Number.isInteger(phase.startWeek) || phase.startWeek < 0) throw new Error('Başlangıç haftası sıfır veya pozitif bir tam sayı olmalı.');
    if (ids.has(phase.id)) throw new Error('Faz kimlikleri farklı olmalı.');
    ids.add(phase.id);
    if (index > 0 && sorted[index - 1].startWeek === phase.startWeek) throw new Error('İki faz aynı haftadan başlayamaz.');
    return { ...phase, name: phase.name.trim(), endWeek: sorted[index + 1] ? sorted[index + 1].startWeek - 1 : null };
  });
}

export type StartedPhase = { id: string; label: string; weeks: number[]; baseWeek: number };

/**
 * Phases that have reached their H0, each with its weeks so far and the
 * phase-relative label History and Charts show, e.g. "Faz 3 (H0-H3)".
 */
export function startedPhases(phases: PhaseDefinition[], currentWeek: number): StartedPhase[] {
  return phases.map(phase => {
    const weeks: number[] = [];
    for (let week = phase.startWeek; week <= Math.min(phase.endWeek ?? currentWeek, currentWeek); week++) weeks.push(week);
    const end = weeks.length ? weeks[weeks.length - 1] - phase.startWeek : 0;
    return { id: phase.id, label: `${phase.name} (H0-H${end})`, weeks, baseWeek: phase.startWeek };
  }).filter(phase => phase.weeks.length > 0);
}

/** The phase holding the current week, else the latest started one. */
export function currentPhaseIndex(phases: StartedPhase[], currentWeek: number): number {
  const index = phases.findIndex(phase => phase.weeks.includes(currentWeek));
  return index >= 0 ? index : Math.max(0, phases.length - 1);
}
