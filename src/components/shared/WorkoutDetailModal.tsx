import { useState } from 'react';
import type { SetLog, ExerciseStatus, Intensity } from '@/types';
import { BottomSheet } from './BottomSheet';

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

const intensityScore: Record<Intensity, number> = {
  failure: 0,
  rir1: 1,
  rir2: 2,
  rir3: 3,
};

const legacyIntensityScore: Record<string, number> = {
  F: 0,
  '+1': 1,
  '+2': 2,
  '+3': 3,
};

function getIntensityScoreValue(intensity: string): number {
  if (intensity in intensityScore) {
    return intensityScore[intensity as Intensity];
  }
  return legacyIntensityScore[intensity] ?? 0;
}

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
  const [editingInputDrafts, setEditingInputDrafts] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editingNotes, setEditingNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  if (!isOpen) return null;

  const getDelta = (curr: number, prev: number): { value: number; icon: string; color: string } => {
    const diff = curr - prev;
    if (diff > 0) return { value: diff, icon: '▲', color: 'text-emerald-400' };
    if (diff < 0) return { value: diff, icon: '▼', color: 'text-rose-400' };
    return { value: 0, icon: '=', color: 'text-(--color-text-secondary)' };
  };

  const getIntensityDelta = (curr: Intensity, prev: Intensity): { value: number; icon: string; color: string } => {
    const diff = getIntensityScoreValue(curr) - getIntensityScoreValue(prev);
    if (diff > 0) return { value: diff, icon: '▲', color: 'text-emerald-400' };
    if (diff < 0) return { value: diff, icon: '▼', color: 'text-rose-400' };
    return { value: 0, icon: '=', color: 'text-(--color-text-secondary)' };
  };

  const startEditing = () => {
    setEditingSets(
      isEmpty
        ? [{ weight: 0, reps: 0, intensity: 'failure' as Intensity }]
        : currentSets.map(s => ({ ...s }))
    );
    setEditingInputDrafts({});
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

  const getInputKey = (idx: number, field: 'weight' | 'reps') => `${idx}-${field}`;

  const sanitizeSetInput = (rawValue: string, field: 'weight' | 'reps') => {
    if (field === 'reps') {
      const digitsOnly = rawValue.replace(/\D/g, '');
      return digitsOnly.replace(/^0+(?=\d)/, '');
    }

    const normalized = rawValue
      .replace(/[\u066B,،﹐，]/g, '.')
      .replace(/[^0-9.]/g, '');
    const [integerPart, ...decimalParts] = normalized.split('.');
    const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '');
    if (decimalParts.length === 0) return normalizedInteger;

    const joinedDecimals = decimalParts.join('');
    if (normalizedInteger === '' && joinedDecimals === '') return '.';
    return `${normalizedInteger || '0'}.${joinedDecimals}`;
  };

  const parseSetInput = (value: string, field: 'weight' | 'reps'): number | null => {
    if (value.trim() === '') return null;

    if (field === 'reps') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return null;
      return Math.max(0, parsed);
    }

    if (value === '.') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, parsed);
  };

  const handleSetInputChange = (idx: number, field: 'weight' | 'reps', rawValue: string) => {
    const key = getInputKey(idx, field);
    const sanitized = sanitizeSetInput(rawValue, field);

    setEditingInputDrafts(prev => ({ ...prev, [key]: sanitized }));

    const parsed = parseSetInput(sanitized, field);
    if (parsed === null) return;
    updateSet(idx, field, parsed);
  };

  const handleSetInputBlur = (idx: number, field: 'weight' | 'reps', currentValue: number) => {
    const key = getInputKey(idx, field);
    const draft = editingInputDrafts[key];
    if (draft === undefined) return;

    const parsed = parseSetInput(draft, field);
    if (parsed === null) {
      updateSet(idx, field, 0);
    } else if (parsed !== currentValue) {
      updateSet(idx, field, parsed);
    }

    setEditingInputDrafts(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSetInputFocus = (idx: number, field: 'weight' | 'reps', currentValue: number) => {
    if (currentValue !== 0) return;
    const key = getInputKey(idx, field);
    setEditingInputDrafts(prev => {
      if (prev[key] !== undefined) return prev;
      return { ...prev, [key]: '' };
    });
  };

  const getSetInputValue = (idx: number, field: 'weight' | 'reps', currentValue: number) => {
    const key = getInputKey(idx, field);
    return editingInputDrafts[key] ?? String(currentValue);
  };

  const handleSave = () => {
    const validSets = editingSets.filter(s => s.weight > 0 || s.reps > 0);
    if (onSaveSets) {
      onSaveSets(validSets); // empty array = clear all sets for this exercise
    }
    setEditingInputDrafts({});
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
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`${exerciseName} — H${weekNumber}`}>
        {/* Color Override Section */}
        <div className="mb-4 p-3 rounded-lg bg-(--color-bg-input) border lb-rule">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold">Renk</h4>
            {currentColorOverride && (
              <button
                onClick={onRemoveColor}
                className="lb-press text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) hover:underline"
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
                className={`lb-press px-2 py-1 rounded-lg text-xs font-semibold ${
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
              <h4 className="text-xs font-semibold">Setleri Düzenle</h4>
              <span className="lb-label">Değişiklikleri Kaydet'e bas</span>
            </div>
            {editingSets.map((set, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-(--color-bg-input) border border-(--color-border)">
                <span className="lb-figure text-xs font-semibold text-(--color-text-secondary) w-6">S{idx + 1}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getSetInputValue(idx, 'weight', set.weight)}
                  onChange={e => handleSetInputChange(idx, 'weight', e.target.value)}
                  onFocus={() => handleSetInputFocus(idx, 'weight', set.weight)}
                  onBlur={() => handleSetInputBlur(idx, 'weight', set.weight)}
                  placeholder="kg"
                  step={0.25}
                  className="w-16 px-2 py-1 text-xs bg-(--color-bg-primary) border border-(--color-border) rounded focus:border-(--color-accent) focus:outline-none"
                />
                <span className="lb-label">×</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={getSetInputValue(idx, 'reps', set.reps)}
                  onChange={e => handleSetInputChange(idx, 'reps', e.target.value)}
                  onFocus={() => handleSetInputFocus(idx, 'reps', set.reps)}
                  onBlur={() => handleSetInputBlur(idx, 'reps', set.reps)}
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
              <button onClick={addSet} className="lb-press text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) hover:underline">+ Set ekle</button>
            </div>
            <div className="flex gap-2 pt-3">
              <button
                onClick={handleSave}
                className="lb-press px-4 py-2 bg-(--color-text-primary) text-(--color-bg-primary) text-xs font-semibold rounded-lg"
              >
                Kaydet
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="lb-press px-4 py-2 border lb-rule text-xs font-medium rounded-lg"
              >
                İptal
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold">Setler</h4>
              <button
                onClick={startEditing}
                className="lb-press px-2 py-1 text-xs font-medium border lb-rule rounded"
              >
                {isEmpty ? '+ Veri Ekle' : '✎ Düzenle'}
              </button>
            </div>
            {currentSets.length > 0 ? (
              currentSets.map((set, idx) => {
                const prevSet = previousSets?.[idx];
                const weightDelta = prevSet ? getDelta(set.weight, prevSet.weight) : null;
                const repsDelta = prevSet ? getDelta(set.reps, prevSet.reps) : null;
                const intensityDelta = prevSet ? getIntensityDelta(set.intensity, prevSet.intensity) : null;

                return (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-(--color-bg-input) border lb-rule">
                    <span className="lb-figure text-xs font-semibold text-(--color-text-secondary) w-8">S{idx + 1}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="lb-figure font-semibold text-sm">{set.weight}kg</span>
                      <span className="text-(--color-text-secondary)">×</span>
                      <span className="lb-figure font-semibold text-sm">{set.reps}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-(--color-btn-bg) font-semibold text-(--color-text-secondary)">
                        {intensityLabels[set.intensity] || set.intensity}
                      </span>
                    </div>
                    {weightDelta && weightDelta.value !== 0 && (
                      <span className={`lb-figure text-xs font-semibold ${weightDelta.color}`}>
                        {weightDelta.icon}{Math.abs(weightDelta.value)}kg
                      </span>
                    )}
                    {repsDelta && repsDelta.value !== 0 && (
                      <span className={`lb-figure text-xs font-semibold ${repsDelta.color}`}>
                        {repsDelta.icon}{Math.abs(repsDelta.value)}rep
                      </span>
                    )}
                    {intensityDelta && intensityDelta.value !== 0 && (
                      <span className={`lb-figure text-xs font-semibold ${intensityDelta.color}`}>
                        {intensityDelta.icon}RIR
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="lb-label italic">Veri yok — düzenle'ye tıklayarak ekle</p>
            )}
          </div>
        )}

        {/* Previous Week Comparison Summary */}
        {previousSets && previousSets.length > 0 && previousWeek !== undefined && (
          <div className="mb-5 p-3 rounded-lg bg-(--color-bg-input) border lb-rule">
            <h4 className="text-xs font-semibold mb-2">
              Önceki Hafta (H{previousWeek})
            </h4>
            <div className="lb-figure text-xs text-(--color-text-secondary)">
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
        <div className="p-3 rounded-lg bg-(--color-bg-input) border lb-rule">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-semibold">Not</h4>
            {!isEditingNotes && (
              <button
                onClick={() => { setEditingNotes(weekNotes || ''); setIsEditingNotes(true); }}
                className="lb-press text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) hover:underline"
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
                  className="lb-press px-3 py-1.5 bg-(--color-text-primary) text-(--color-bg-primary) text-xs font-semibold rounded-lg"
                >
                  Kaydet
                </button>
                <button
                  onClick={() => setIsEditingNotes(false)}
                  className="lb-press px-3 py-1.5 border lb-rule text-xs font-medium rounded-lg"
                >
                  İptal
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-(--color-text-secondary) leading-relaxed">
              {weekNotes || <span className="italic text-(--color-text-secondary)">Not yok</span>}
            </p>
          )}
        </div>
    </BottomSheet>
  );
}
