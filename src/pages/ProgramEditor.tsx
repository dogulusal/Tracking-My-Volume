import { AppContext } from '@/context/AppContext';
import { phaseAt } from '@/utils/programVersions';
import { NumberInput } from '@/components/shared/NumberInput';
import { useState, useContext, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { usePrograms } from '@/hooks/usePrograms';
import { PageContainer } from '@/components/layout/PageContainer';
import { moveItem } from '@/utils/reorder';
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
  const ctx = useContext(AppContext)!;
  const [params] = useSearchParams();
  const requestedWeek = Number(params.get('week'));
  const week = params.has('week') && Number.isInteger(requestedWeek) && requestedWeek >= 0 ? requestedWeek : ctx.state.currentWeek;
  const phase = phaseAt(ctx.state, week);
  const { programs, addProgram, updateProgram } = usePrograms(week);

  const existingProgram = id ? programs.find(p => p.id === id) : undefined;

  const [name, setName] = useState(existingProgram?.name || '');
  const [exercises, setExercises] = useState<ExerciseDefinition[]>(
    existingProgram?.exercises || []
  );
  const [order, setOrder] = useState(existingProgram?.order || programs.length + 1);
  const loadedEditorKey = useRef<string | null>(null);

  useEffect(() => {
    if (id && !existingProgram) return;
    const key = `${week}:${id ?? 'new'}`;
    if (loadedEditorKey.current === key) return;
    loadedEditorKey.current = key;
    setName(existingProgram?.name ?? '');
    setExercises(existingProgram?.exercises ?? []);
    setOrder(existingProgram?.order ?? programs.length + 1);
  }, [id, week, existingProgram, programs.length]);

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

  // Array position IS the exercise order — there is no separate `order` field.
  const moveExercise = (index: number, delta: number) => {
    setExercises(prev => moveItem(prev, index, delta));
  };

  const removeExercise = (index: number) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
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
      }, true);
      ctx.dispatch({ type: 'SET_EXERCISE_ROW_ORDER', payload: {
        programId: existingProgram.id, exerciseIds: finalExercises.map(exercise => exercise.id),
      } });
    } else {
      addProgram({ name, order, exercises: finalExercises });
    }
    navigate(`/programs?week=${week}`);
  };

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          {existingProgram ? 'Programı düzenle' : 'Yeni program'}
        </h1>
      </div>
      <p className="lb-label mb-4">{phase?.name} · H{week - (phase?.startWeek ?? 0)} için düzenleniyor. Değişiklikler bir sonraki program sürümüne kadar geçerli olur. Önceki haftalar ve diğer fazlar korunur.</p>
      <div className="space-y-6 max-w-2xl">
        {/* Program Name */}
        <div>
          <label className="block text-sm font-semibold mb-2">
            Program adı
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Örn: Upper 1"
            className="w-full px-4 py-2.5 bg-(--color-bg-input) border lb-rule rounded-lg text-sm focus:outline-none focus:border-(--color-text-primary) placeholder:text-(--color-text-secondary)"
          />
        </div>

        {/* Order */}
        <div>
          <label className="block text-sm font-semibold mb-2">
            Sıra
          </label>
          <input
            type="number"
            value={order}
            onChange={e => setOrder(Number(e.target.value))}
            min={1}
            className="lb-figure w-20 px-4 py-2.5 bg-(--color-bg-input) border lb-rule rounded-lg text-sm focus:outline-none focus:border-(--color-text-primary)"
          />
        </div>

        {/* Exercises */}
        <div>
          <h2 className="text-base font-semibold mb-3">Egzersizler</h2>
          <p className="lb-label mb-3">Sil düğmesi egzersizi programdan tamamen kaldırır. Geçmiş kayıtları korunur. Değişiklikler Kaydet ile uygulanır.</p>
          <div className="space-y-3">
            {exercises.map((exercise, idx) => (
              <div
                key={exercise.id}
                className={`flex flex-wrap items-center gap-2 p-4 rounded-lg border lb-rule ${
                  exercise.isActive ? '' : 'opacity-50'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveExercise(idx, -1)}
                    disabled={idx === 0}
                    aria-label={`${exercise.name || 'Egzersiz'} yukarı taşı`}
                    title="Yukarı taşı"
                    className="lb-press px-1.5 leading-none text-xs rounded border lb-rule text-(--color-text-secondary) disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveExercise(idx, 1)}
                    disabled={idx === exercises.length - 1}
                    aria-label={`${exercise.name || 'Egzersiz'} aşağı taşı`}
                    title="Aşağı taşı"
                    className="lb-press px-1.5 leading-none text-xs rounded border lb-rule text-(--color-text-secondary) disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ▼
                  </button>
                </div>
                <input
                  type="text"
                  value={exercise.name}
                  onChange={e => updateExercise(idx, 'name', e.target.value)}
                  placeholder="Egzersiz adı"
                  className="flex-1 min-w-[150px] px-3 py-2 bg-(--color-bg-input) border lb-rule rounded-lg text-sm focus:outline-none focus:border-(--color-text-primary) placeholder:text-(--color-text-secondary)"
                />
                <div className="flex items-center gap-1">
                  <label className="lb-label">Set</label>
                  <NumberInput

                    value={exercise.defaultSets}
                    onValueChange={value => updateExercise(idx, 'defaultSets', value)}
                    min={1}
                    className="lb-figure w-14 px-2 py-1 bg-(--color-bg-input) border lb-rule rounded text-sm focus:outline-none focus:border-(--color-text-primary)"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label className="lb-label">Kg</label>
                  <NumberInput

                    value={exercise.defaultWeight}
                    onValueChange={value => updateExercise(idx, 'defaultWeight', value)}
                    min={0}
                    step={0.5}
                    className="lb-figure w-16 px-2 py-1 bg-(--color-bg-input) border lb-rule rounded text-sm focus:outline-none focus:border-(--color-text-primary)"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label className="lb-label">Rep</label>
                  <NumberInput

                    value={exercise.defaultReps}
                    onValueChange={value => updateExercise(idx, 'defaultReps', value)}
                    min={0}
                    className="lb-figure w-14 px-2 py-1 bg-(--color-bg-input) border lb-rule rounded text-sm focus:outline-none focus:border-(--color-text-primary)"
                  />
                </div>
                <button
                  onClick={() => removeExercise(idx)}
                  className="lb-press px-3 py-2 min-h-11 border lb-rule rounded-lg text-sm font-semibold"
                  style={{ color: 'var(--lb-drop)' }}
                  aria-label={`${exercise.name || 'Egzersiz'} sil`}
                  title="Sil"
                >
                  Sil
                </button>
                {!exercise.isActive && (
                  <button onClick={() => updateExercise(idx, 'isActive', true)} className="lb-press px-3 py-2 text-xs border lb-rule rounded-lg">
                    Geri al
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addExercise}
            className="lb-press mt-3 px-4 py-2 border lb-rule text-sm font-medium rounded-lg"
          >
            + Egzersiz ekle
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t lb-rule">
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="lb-press px-8 py-3 bg-(--color-text-primary) text-(--color-bg-primary) font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Kaydet
          </button>
          <button
            onClick={() => navigate(`/programs?week=${week}`)}
            className="px-8 py-3 bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-(--color-text-primary) font-bold rounded-xl transition-all"
          >
            İptal
          </button>
        </div>
      </div>
    </PageContainer>
  );
}
