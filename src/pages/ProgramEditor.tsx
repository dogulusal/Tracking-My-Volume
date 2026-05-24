import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePrograms } from '@/hooks/usePrograms';
import { PageContainer } from '@/components/layout/PageContainer';
import type { ExerciseDefinition } from '@/types';

function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') + '_' + Date.now().toString(36);
}

export function ProgramEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { programs, addProgram, updateProgram } = usePrograms();

  const existingProgram = id ? programs.find(p => p.id === id) : undefined;

  const [name, setName] = useState(existingProgram?.name || '');
  const [exercises, setExercises] = useState<ExerciseDefinition[]>(
    existingProgram?.exercises || []
  );
  const [order, setOrder] = useState(existingProgram?.order || programs.length + 1);

  const addExercise = () => {
    setExercises([
      ...exercises,
      {
        id: 'new_' + Date.now().toString(36),
        name: '',
        defaultSets: 1,
        defaultWeight: 0,
        defaultReps: 0,
        isActive: true,
      },
    ]);
  };

  const updateExercise = (index: number, field: keyof ExerciseDefinition, value: string | number | boolean) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    setExercises(updated);
  };

  const removeExercise = (index: number) => {
    const exercise = exercises[index];
    // If exercise has no established id (new), remove completely
    if (exercise.id.startsWith('new_')) {
      setExercises(exercises.filter((_, i) => i !== index));
    } else {
      // Soft-delete: mark as inactive
      updateExercise(index, 'isActive', false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;

    const finalExercises = exercises.map(e => ({
      ...e,
      id: e.id.startsWith('new_') ? generateId(e.name) : e.id,
    }));

    if (existingProgram) {
      updateProgram({
        ...existingProgram,
        name,
        order,
        exercises: finalExercises,
      });
    } else {
      addProgram({ name, order, exercises: finalExercises });
    }
    navigate('/programs');
  };

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          {existingProgram ? 'Programı Düzenle' : 'Yeni Program'}
        </h1>
      </div>
      <div className="space-y-6 max-w-2xl">
        {/* Program Name */}
        <div>
          <label className="block text-sm font-bold text-(--color-text-primary) mb-2">
            Program Adı
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Örn: Upper 1"
            className="w-full px-4 py-2.5 bg-(--color-bg-input) border border-(--color-border) rounded-xl text-sm font-semibold focus:outline-none focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)"
          />
        </div>

        {/* Order */}
        <div>
          <label className="block text-sm font-bold text-(--color-text-primary) mb-2">
            Sıra
          </label>
          <input
            type="number"
            value={order}
            onChange={e => setOrder(Number(e.target.value))}
            min={1}
            className="w-20 px-4 py-2.5 bg-(--color-bg-input) border border-(--color-border) rounded-xl text-sm font-semibold focus:outline-none focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)"
          />
        </div>

        {/* Exercises */}
        <div>
          <h2 className="text-xl font-black mb-3">Egzersizler</h2>
          <div className="space-y-3">
            {exercises.map((exercise, idx) => (
              <div
                key={exercise.id}
                className={`flex flex-wrap items-center gap-2 p-4 rounded-xl border ${
                  exercise.isActive
                    ? 'bg-(--color-bg-card) border-(--color-border)'
                    : 'bg-(--color-bg-input) border-(--color-border) opacity-50'
                }`}
              >
                <input
                  type="text"
                  value={exercise.name}
                  onChange={e => updateExercise(idx, 'name', e.target.value)}
                  placeholder="Egzersiz adı"
                  className="flex-1 min-w-[150px] px-3 py-2 bg-(--color-bg-input) border border-(--color-border) rounded-lg text-sm font-semibold focus:outline-none focus:border-(--color-accent)"
                />
                <div className="flex items-center gap-1">
                  <label className="text-xs text-(--color-text-muted)">Set:</label>
                  <input
                    type="number"
                    value={exercise.defaultSets}
                    onChange={e => updateExercise(idx, 'defaultSets', Number(e.target.value))}
                    min={1}
                    className="w-14 px-2 py-1 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs text-(--color-text-muted)">Kg:</label>
                  <input
                    type="number"
                    value={exercise.defaultWeight}
                    onChange={e => updateExercise(idx, 'defaultWeight', Number(e.target.value))}
                    min={0}
                    step={0.5}
                    className="w-16 px-2 py-1 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs text-(--color-text-muted)">Rep:</label>
                  <input
                    type="number"
                    value={exercise.defaultReps}
                    onChange={e => updateExercise(idx, 'defaultReps', Number(e.target.value))}
                    min={0}
                    className="w-14 px-2 py-1 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
                  />
                </div>
                <button
                  onClick={() => removeExercise(idx)}
                  className="p-1 text-red-400 hover:text-red-300 transition-colors"
                  title={exercise.isActive ? 'Devre dışı bırak' : 'Sil'}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addExercise}
            className="mt-3 px-4 py-2 bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-sm font-bold rounded-lg transition-all hover:scale-105"
          >
            + Egzersiz Ekle
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-(--color-border)">
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-8 py-3 bg-(--color-accent) hover:bg-(--color-accent-hover) text-white font-black rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-(--color-accent-glow) disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Kaydet
          </button>
          <button
            onClick={() => navigate('/programs')}
            className="px-8 py-3 bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-(--color-text-primary) font-bold rounded-xl transition-all"
          >
            İptal
          </button>
        </div>
      </div>
    </PageContainer>
  );
}
