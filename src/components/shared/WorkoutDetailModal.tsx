import { useState } from 'react';
import type { SetLog, ExerciseStatus, Intensity } from '@/types';

interface WorkoutDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName: string;
  exerciseId: string;
  weekNumber: number;
  currentSets: SetLog[];
  previousSets?: SetLog[];
  previousWeek?: number;
  weekNotes?: string;
  isEmpty: boolean;
  currentColorOverride?: ExerciseStatus;
  autoStatus: ExerciseStatus;
  onSaveSets?: (sets: SetLog[]) => void;
  onSaveNotes?: (notes: string) => void;
  onSetColor?: (status: ExerciseStatus) => void;
  onRemoveColor?: () => void;
}

const intensityLabels: Record<string, string> = {
  failure: 'F',
  rir1: '+1',
  rir2: '+2',
  rir3: '+3',
};

const STATUS_OPTIONS: { value: ExerciseStatus; label: string; emoji: string }[] = [
  { value: 'improved', label: 'İlerleme', emoji: '🟢' },
  { value: 'decreased', label: 'Düşüş', emoji: '🔴' },
  { value: 'same', label: 'Aynı', emoji: '⚪' },
  { value: 'new', label: 'Yeni', emoji: '🔵' },
  { value: 'holiday', label: 'Tatil', emoji: '🟡' },
  { value: 'removed', label: 'Kaldırıldı', emoji: '⚫' },
];

export function WorkoutDetailModal({
  isOpen,
  onClose,
  exerciseName,
  weekNumber,
  currentSets,
  previousSets,
  previousWeek,
  weekNotes,
  isEmpty,
  currentColorOverride,
  autoStatus,
  onSaveSets,
  onSaveNotes,
  onSetColor,
  onRemoveColor,
}: WorkoutDetailModalProps) {
  const [editingSets, setEditingSets] = useState<SetLog[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingNotes, setEditingNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  if (!isOpen) return null;

  const getDelta = (curr: number, prev: number): { value: number; icon: string; color: string } => {
    const diff = curr - prev;
    if (diff > 0) return { value: diff, icon: '▲', color: 'text-emerald-400' };
    if (diff < 0) return { value: diff, icon: '▼', color: 'text-rose-400' };
    return { value: 0, icon: '=', color: 'text-(--color-text-muted)' };
  };

  const startEditing = () => {
    setEditingSets(
      isEmpty
        ? [{ weight: 0, reps: 0, intensity: 'failure' as Intensity }]
        : currentSets.map(s => ({ ...s }))
    );
    setIsEditing(true);
  };

  const addSet = () => {
    setEditingSets(prev => [...prev, { weight: 0, reps: 0, intensity: 'failure' as Intensity }]);
  };

  const removeSet = (idx: number) => {
    setEditingSets(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSet = (idx: number, field: keyof SetLog, value: number | string) => {
    setEditingSets(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSave = () => {
    const validSets = editingSets.filter(s => s.weight > 0 || s.reps > 0);
    if (onSaveSets) {
      onSaveSets(validSets); // empty array = clear all sets for this exercise
    }
    setIsEditing(false);
    onClose();
  };

  const handleSaveNotes = () => {
    if (onSaveNotes) {
      onSaveNotes(editingNotes);
    }
    setIsEditingNotes(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-(--color-bg-card) rounded-2xl p-6 max-w-md w-full border border-(--color-border) shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-black text-(--color-text-primary)">{exerciseName}</h3>
            <span className="text-xs font-bold text-(--color-accent)">Hafta {weekNumber}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors text-xl"
          >
            ✕
          </button>
        </div>

        {/* Color Override Section */}
        <div className="mb-4 p-3 rounded-xl bg-(--color-bg-input) border border-(--color-border)">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-text-muted)">Renk</h4>
            {currentColorOverride && (
              <button
                onClick={onRemoveColor}
                className="text-xs text-(--color-accent) hover:underline font-bold"
              >
                Otomatik
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onSetColor?.(opt.value)}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  (currentColorOverride || autoStatus) === opt.value
                    ? 'ring-2 ring-(--color-accent) scale-105'
                    : 'opacity-70 hover:opacity-100'
                } bg-(--color-btn-bg)`}
              >
                {opt.emoji} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sets Detail or Edit Form */}
        {isEditing ? (
          <div className="space-y-2 mb-5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-text-muted)">Setleri Düzenle</h4>
              <span className="text-xs text-(--color-accent) font-bold">Değişiklikleri Kaydet'e bas</span>
            </div>
            {editingSets.map((set, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-(--color-bg-input) border border-(--color-border)">
                <span className="text-xs font-bold text-(--color-accent) w-6">S{idx + 1}</span>
                <input
                  type="number"
                  value={set.weight || ''}
                  onChange={e => updateSet(idx, 'weight', Number(e.target.value))}
                  placeholder="kg"
                  step={0.25}
                  className="w-16 px-2 py-1 text-xs bg-(--color-bg-primary) border border-(--color-border) rounded focus:border-(--color-accent) focus:outline-none"
                />
                <span className="text-xs text-(--color-text-muted)">×</span>
                <input
                  type="number"
                  value={set.reps || ''}
                  onChange={e => updateSet(idx, 'reps', Number(e.target.value))}
                  placeholder="rep"
                  className="w-14 px-2 py-1 text-xs bg-(--color-bg-primary) border border-(--color-border) rounded focus:border-(--color-accent) focus:outline-none"
                />
                <select
                  value={set.intensity}
                  onChange={e => updateSet(idx, 'intensity', e.target.value)}
                  className="px-1 py-1 text-xs bg-(--color-bg-primary) border border-(--color-border) rounded focus:outline-none"
                >
                  <option value="failure">F</option>
                  <option value="rir1">+1</option>
                  <option value="rir2">+2</option>
                  <option value="rir3">+3</option>
                </select>
                <button onClick={() => removeSet(idx)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <button onClick={addSet} className="text-xs font-bold text-(--color-accent) hover:underline">+ Set Ekle</button>
            </div>
            <div className="flex gap-2 pt-3">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-(--color-accent) hover:bg-(--color-accent-hover) text-white text-xs font-bold rounded-lg transition-all"
              >
                Kaydet
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-(--color-text-primary) text-xs font-bold rounded-lg transition-all"
              >
                İptal
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-text-muted)">Setler</h4>
              <button
                onClick={startEditing}
                className="px-2 py-1 text-xs font-bold bg-(--color-accent) text-white hover:bg-(--color-accent-hover) rounded transition-all"
              >
                {isEmpty ? '+ Veri Ekle' : '✎ Düzenle'}
              </button>
            </div>
            {currentSets.length > 0 ? (
              currentSets.map((set, idx) => {
                const prevSet = previousSets?.[idx];
                const weightDelta = prevSet ? getDelta(set.weight, prevSet.weight) : null;
                const repsDelta = prevSet ? getDelta(set.reps, prevSet.reps) : null;

                return (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-(--color-bg-input) border border-(--color-border)">
                    <span className="text-xs font-bold text-(--color-accent) w-8">S{idx + 1}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-bold text-sm">{set.weight}kg</span>
                      <span className="text-(--color-text-muted)">×</span>
                      <span className="font-bold text-sm">{set.reps}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-(--color-btn-bg) font-semibold text-(--color-text-secondary)">
                        {intensityLabels[set.intensity] || set.intensity}
                      </span>
                    </div>
                    {weightDelta && weightDelta.value !== 0 && (
                      <span className={`text-xs font-bold ${weightDelta.color}`}>
                        {weightDelta.icon}{Math.abs(weightDelta.value)}kg
                      </span>
                    )}
                    {repsDelta && repsDelta.value !== 0 && (
                      <span className={`text-xs font-bold ${repsDelta.color}`}>
                        {repsDelta.icon}{Math.abs(repsDelta.value)}rep
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-(--color-text-muted) italic">Veri yok — düzenle'ye tıklayarak ekle</p>
            )}
          </div>
        )}

        {/* Previous Week Comparison Summary */}
        {previousSets && previousSets.length > 0 && previousWeek !== undefined && (
          <div className="mb-5 p-3 rounded-xl bg-(--color-bg-input) border border-(--color-border)">
            <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-text-muted) mb-2">
              Önceki Hafta (H{previousWeek})
            </h4>
            <div className="text-xs font-set text-(--color-text-secondary)">
              {previousSets.map((s, i) => (
                <span key={i}>
                  {i > 0 && ' | '}
                  {s.weight}×{s.reps} {intensityLabels[s.intensity] || ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Week Notes */}
        <div className="p-3 rounded-xl bg-(--color-bg-input) border border-(--color-border)">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-text-muted)">Not</h4>
            {!isEditingNotes && (
              <button
                onClick={() => { setEditingNotes(weekNotes || ''); setIsEditingNotes(true); }}
                className="text-xs font-bold text-(--color-accent) hover:underline"
              >
                {weekNotes ? 'Düzenle' : '+ Not Ekle'}
              </button>
            )}
          </div>
          {isEditingNotes ? (
            <div className="space-y-2">
              <textarea
                value={editingNotes}
                onChange={e => setEditingNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm bg-(--color-bg-primary) border border-(--color-border) rounded-lg focus:border-(--color-accent) focus:outline-none resize-y"
                placeholder="Bu hafta hakkında not..."
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveNotes}
                  className="px-3 py-1.5 bg-(--color-accent) hover:bg-(--color-accent-hover) text-white text-xs font-bold rounded-lg"
                >
                  Kaydet
                </button>
                <button
                  onClick={() => setIsEditingNotes(false)}
                  className="px-3 py-1.5 bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-(--color-text-primary) text-xs font-bold rounded-lg"
                >
                  İptal
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-(--color-text-secondary) leading-relaxed">
              {weekNotes || <span className="italic text-(--color-text-muted)">Not yok</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
