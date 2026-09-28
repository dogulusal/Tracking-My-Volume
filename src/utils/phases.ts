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
