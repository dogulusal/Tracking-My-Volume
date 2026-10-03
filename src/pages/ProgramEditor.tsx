import { AppContext } from '@/context/AppContext';
import { phaseAt } from '@/utils/programVersions';
import { NumberInput } from '@/components/shared/NumberInput';
import { useState, useContext, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { usePrograms } from '@/hooks/usePrograms';
import { MOVEMENT_LIBRARY } from '@/data/movementLibrary';
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

  // Names to suggest while typing: the person's own movements, then common ones.
  const suggestions = [...new Set([
    ...ctx.state.programs.flatMap(program => program.exercises.map(exercise => exercise.name)),
    ...MOVEMENT_LIBRARY,
  ])];
  const numberClass = 'lb-figure mt-1 w-full h-12 px-3 rounded-xl bg-(--color-bg-input) text-[20px]! font-semibold text-(--color-text-primary) focus:outline-none';

  return (
    <div className="max-w-2xl mx-auto px-5 pt-2 pb-8">
      <button onClick={() => navigate(`/programs?week=${week}`)} className="-ml-1 h-11 flex items-center gap-1 text-[16px] text-(--color-text-secondary)">
        <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        Programlar
      </button>
      <h1 className="a-display text-[44px] mt-1">{existingProgram ? 'Günü düzenle' : 'Yeni gün'}</h1>
      <p className="mt-1 text-[13px] leading-snug text-(--color-text-secondary)">{phase?.name} · H{week - (phase?.startWeek ?? 0)} için. Değişiklikler bir sonraki program sürümüne kadar geçerli; önceki haftalar ve diğer fazlar korunur.</p>

      <div className="mt-5 grid grid-cols-[1fr_88px] gap-2">
        <label className="text-[13px] text-(--color-text-secondary)">Günün adı
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Örn: Upper 1"
            className="mt-1 w-full h-14 px-4 rounded-2xl bg-(--color-bg-card) text-[18px]! text-(--color-text-primary) focus:outline-none placeholder:text-(--color-text-secondary)" />
        </label>
        <label className="text-[13px] text-(--color-text-secondary)">Sıra
          <input type="number" value={order} onChange={e => setOrder(Number(e.target.value))} min={1}
            className="lb-figure mt-1 w-full h-14 px-3 rounded-2xl bg-(--color-bg-card) text-[20px]! font-semibold text-(--color-text-primary) focus:outline-none" />
        </label>
      </div>

      <h2 className="a-display text-[28px] mt-7">Hareketler</h2>
      <p className="mt-1 text-[13px] leading-snug text-(--color-text-secondary)">Sil, hareketi programdan kaldırır; geçmiş kayıtları korunur. Değişiklikler Kaydet ile uygulanır. Hareket antrenman sırasında da eklenebilir.</p>
      <datalist id="hareket-onerileri">
        {suggestions.map(suggestion => <option key={suggestion} value={suggestion} />)}
      </datalist>
      <div className="mt-3 flex flex-col gap-2">
        {exercises.map((exercise, idx) => (
          <div key={exercise.id} className={`a-card px-3 pt-3 pb-2 ${exercise.isActive ? '' : 'opacity-50'}`}>
            <div className="flex items-center gap-2">
              <span className="lb-figure w-6 text-center text-[20px] font-semibold text-(--color-text-secondary)">{idx + 1}</span>
              <input type="text" value={exercise.name} onChange={e => updateExercise(idx, 'name', e.target.value)} list="hareket-onerileri"
                placeholder="Hareket adı" aria-label={`${idx + 1}. hareketin adı`}
                className="flex-1 min-w-0 h-12 px-3 rounded-xl bg-(--color-bg-input) text-[17px]! focus:outline-none placeholder:text-(--color-text-secondary)" />
            </div>
            <div className="mt-2 ml-8 grid grid-cols-3 gap-2">
              <label className="text-[12px] text-(--color-text-secondary)">Set
                <NumberInput value={exercise.defaultSets} onValueChange={value => updateExercise(idx, 'defaultSets', value)} min={1} className={numberClass} />
              </label>
              <label className="text-[12px] text-(--color-text-secondary)">Kg
                <NumberInput value={exercise.defaultWeight} onValueChange={value => updateExercise(idx, 'defaultWeight', value)} min={0} step={0.5} className={numberClass} />
              </label>
              <label className="text-[12px] text-(--color-text-secondary)">Tekrar
                <NumberInput value={exercise.defaultReps} onValueChange={value => updateExercise(idx, 'defaultReps', value)} min={0} className={numberClass} />
              </label>
            </div>
            <div className="mt-1 ml-8 flex items-center gap-1">
              <button onClick={() => moveExercise(idx, -1)} disabled={idx === 0} aria-label={`${exercise.name || 'Hareket'} yukarı taşı`}
                className="h-11 px-3 text-[15px] text-(--color-text-secondary) disabled:opacity-30">Yukarı</button>
              <button onClick={() => moveExercise(idx, 1)} disabled={idx === exercises.length - 1} aria-label={`${exercise.name || 'Hareket'} aşağı taşı`}
                className="h-11 px-3 text-[15px] text-(--color-text-secondary) disabled:opacity-30">Aşağı</button>
              {!exercise.isActive && (
                <button onClick={() => updateExercise(idx, 'isActive', true)} className="h-11 px-3 text-[15px]">Geri al</button>
              )}
              <button onClick={() => removeExercise(idx)} aria-label={`${exercise.name || 'Hareket'} sil`}
                className="ml-auto h-11 px-3 text-[15px]" style={{ color: 'var(--lb-drop)' }}>Sil</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={addExercise} className="mt-2 w-full h-14 rounded-2xl bg-(--color-bg-card) text-[16px] font-medium">Hareket ekle</button>

      <div className="mt-8 flex flex-col gap-2">
        <button onClick={handleSave} disabled={!name.trim()}
          className="h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold disabled:opacity-40">Kaydet</button>
        <button onClick={() => navigate(`/programs?week=${week}`)} className="h-12 rounded-2xl text-[16px] text-(--color-text-secondary)">Vazgeç</button>
      </div>
    </div>
  );
}
