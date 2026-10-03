import { ProgramWeekPicker } from '@/components/shared/ProgramWeekPicker';
import { Link, useSearchParams } from 'react-router-dom';
import { useContext, useMemo, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { usePrograms } from '@/hooks/usePrograms';
import { usePlans } from '@/hooks/usePlans';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import type { Plan } from '@/types';
import { Modal } from '@/components/shared/Modal';
import { syncExerciseLogs } from '@/utils/exerciseSync';

function PlanSelectModal({
  plans,
  activePlanId,
  onSelect,
  onClose,
  onNewPlan,
}: {
  plans: Plan[];
  activePlanId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onNewPlan: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <button aria-label="Kapat" className="absolute inset-0 bg-black/50 cursor-default" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Plan seç" className="relative w-full max-w-xl mx-auto bg-(--color-bg-card) rounded-t-[22px] px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="a-display text-[30px]">Plan seç</h2>
          <button onClick={onClose} className="h-11 px-4 rounded-full bg-(--color-bg-input) text-[15px] font-semibold">Kapat</button>
        </div>
        <div className="flex flex-col gap-2">
          {plans.map(plan => (
            <button key={plan.id} onClick={() => { onSelect(plan.id); onClose(); }}
              className="w-full min-h-16 px-4 py-2.5 rounded-2xl bg-(--color-bg-input) text-left flex items-center justify-between"
              style={plan.id === activePlanId ? { boxShadow: 'inset 0 0 0 1.5px var(--color-text-primary)' } : undefined}>
              <span className="flex flex-col">
                <span className="text-[17px] font-semibold">{plan.name}</span>
                <span className="text-[14px] text-(--color-text-secondary)">{plan.programIds.length} gün</span>
              </span>
              {plan.id === activePlanId && <span className="text-[14px] font-semibold">Aktif</span>}
            </button>
          ))}
          <button onClick={() => { onNewPlan(); onClose(); }} className="h-[52px] rounded-2xl text-[16px] text-(--color-text-secondary)">Yeni plan oluştur</button>
        </div>
      </div>
    </div>
  );
}

function NewPlanModal({
  programs,
  onConfirm,
  onClose,
}: {
  programs: { id: string; name: string }[];
  onConfirm: (name: string, programIds: string[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <button aria-label="Kapat" className="absolute inset-0 bg-black/50 cursor-default" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Yeni plan" className="relative w-full max-w-xl mx-auto max-h-[90vh] overflow-y-auto bg-(--color-bg-card) rounded-t-[22px] px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="a-display text-[30px]">Yeni plan</h2>
          <button onClick={onClose} className="h-11 px-4 rounded-full bg-(--color-bg-input) text-[15px] font-semibold">Kapat</button>
        </div>
        <input type="text" placeholder="Plan adı (örn. Hipertrofi)" value={name} onChange={e => setName(e.target.value)} aria-label="Plan adı"
          className="w-full h-14 px-4 rounded-2xl bg-(--color-bg-input) text-[18px]! focus:outline-none placeholder:text-(--color-text-secondary)" />
        <p className="mt-4 mb-2 text-[14px] text-(--color-text-secondary)">Hangi günler bu planda?</p>
        <div className="flex flex-col gap-1.5">
          {programs.map(p => (
            <label key={p.id} className="min-h-12 px-4 rounded-2xl bg-(--color-bg-input) flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} className="w-5 h-5" />
              <span className="text-[16px]">{p.name}</span>
            </label>
          ))}
        </div>
        <button disabled={!name.trim() || selected.length === 0} onClick={() => onConfirm(name.trim(), selected)}
          className="mt-5 w-full h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold disabled:opacity-40">
          Oluştur
        </button>
      </div>
    </div>
  );
}

export function ProgramSelect() {
  const state = useContext(AppContext)!.state;
  const phases = state.phases;
  const [params, setParams] = useSearchParams();
  const requestedWeek = Number(params.get('week'));
  const selectedWeek = params.has('week') && Number.isInteger(requestedWeek) && requestedWeek >= 0 ? requestedWeek : state.currentWeek;
  const { programs, addProgram } = usePrograms(selectedWeek);
  const { plans, activePlan, activePlanId, activePlanPrograms, setActivePlan, addPlan, updatePlan } = usePlans(selectedWeek);
  const { weekLogs } = useWeekLogs();

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const availablePrograms = programs.filter(p => !activePlan?.programIds.includes(p.id));

  const programPreviews = useMemo(() => {
    return activePlanPrograms.map(program => {
      const lastLog = weekLogs
        .filter(log => log.programId === program.id && log.weekNumber <= selectedWeek && log.weekNumber >= (phases.find(p => selectedWeek >= p.startWeek && (p.endWeek === null || selectedWeek <= p.endWeek))?.startWeek ?? 0) && !log.isHoliday && log.exercises.length > 0)
        .sort((a, b) => b.weekNumber - a.weekNumber)[0] ?? null;

      const visibleExercises = syncExerciseLogs(program, lastLog?.exercises ?? [], exercise => ({
        exerciseId: exercise.id, exerciseName: exercise.name,
        sets: exercise.defaultWeight || exercise.defaultReps
          ? Array.from({ length: exercise.defaultSets }, () => ({ weight: exercise.defaultWeight, reps: exercise.defaultReps, intensity: 'failure' as const }))
          : [],
      })).filter(exercise => program.exercises.some(definition => definition.id === exercise.exerciseId && definition.isActive));
      const phase = lastLog ? phases.find(p => lastLog.weekNumber >= p.startWeek && (p.endWeek === null || lastLog.weekNumber <= p.endWeek)) : undefined;
      const lastWeekLabel = lastLog ? `${phase?.name ?? ''} · H${lastLog.weekNumber - (phase?.startWeek ?? 0)}` : '';
      return { program, lastLog, visibleExercises, lastWeekLabel };
    });
  }, [activePlanPrograms, weekLogs, phases, selectedWeek]);

  return (
    <div className="max-w-3xl mx-auto px-5 pt-2 pb-8">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="a-display text-[48px]">Programlar</h1>
          <p className="mt-1 text-[15px] text-(--color-text-secondary)">{activePlan?.name ?? 'Plan yok'} · {activePlanPrograms.length} antrenman günü</p>
        </div>
        {plans.length > 1 && (
          <button onClick={() => setShowPlanModal(true)} className="shrink-0 h-11 px-4 rounded-full bg-(--color-bg-card) text-[15px] font-medium">Plan değiştir</button>
        )}
      </div>

      <div className="mt-5">
        <ProgramWeekPicker week={selectedWeek} onChange={week => setParams({ week: String(week) })} allowCopy />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {programPreviews.map(({ program, lastLog, visibleExercises, lastWeekLabel }) => (
          <section key={program.id} className="a-card px-4 pt-3.5 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="a-display text-[32px] truncate">{program.name}</h2>
                <p className="mt-0.5 text-[14px] text-(--color-text-secondary)">
                  {visibleExercises.length} hareket{lastLog ? ` · son kayıt ${lastWeekLabel}` : ' · henüz kayıt yok'}
                </p>
              </div>
              <Link to={`/programs/edit/${program.id}?week=${selectedWeek}`} className="shrink-0 h-11 px-4 rounded-full bg-(--color-bg-input) flex items-center text-[15px] font-medium">Düzenle</Link>
            </div>

            <ul className="mt-3">
              {visibleExercises.map(exercise => (
                <li key={exercise.exerciseId} className="flex items-baseline justify-between gap-3 py-2 border-t border-(--color-border)">
                  <span className="min-w-0 text-[16px] truncate">{exercise.exerciseName}</span>
                  <span className="lb-figure shrink-0 text-[17px] text-(--color-text-secondary)">
                    {exercise.sets.length ? exercise.sets.map(set => `${set.weight}×${set.reps}`).join('  ') : 'kayıt yok'}
                  </span>
                </li>
              ))}
              {visibleExercises.length === 0 && (
                <li className="py-2 border-t border-(--color-border) text-[15px] text-(--color-text-secondary)">Hareket yok; antrenmanda eklenebilir.</li>
              )}
            </ul>

            <Link to={`/workout/${program.id}/week/${selectedWeek}`}
              className="mt-3 flex items-center justify-center h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold">
              Antrenman gir
            </Link>
            <div className="mt-1 flex items-center justify-between">
              <button className="h-11 px-1 text-[15px] text-(--color-text-secondary)" onClick={() => {
                const base = program.name.replace(/ · \d+$/, '');
                let occurrence = 2;
                while (programs.some(p => p.name === `${base} · ${occurrence}`)) occurrence++;
                addProgram({ name: `${base} · ${occurrence}`, order: programs.length + 1, exercises: program.exercises.map(e => ({ ...e, id: crypto.randomUUID() })) });
              }}>Günü kopyala</button>
              <button className="h-11 px-1 text-[15px]" style={{ color: 'var(--lb-drop)' }} onClick={() => setRemoveId(program.id)}>Günü plandan çıkar</button>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Link to={`/programs/edit?week=${selectedWeek}`} className="h-14 rounded-2xl bg-(--color-bg-card) flex items-center justify-center text-[16px] font-medium">Yeni gün ekle</Link>
        {availablePrograms.length > 0 && (
          <button onClick={() => setShowLibrary(!showLibrary)} aria-expanded={showLibrary} className="h-14 rounded-2xl bg-(--color-bg-card) text-[16px] font-medium">
            Mevcut günlerden ekle ({availablePrograms.length})
          </button>
        )}
        {showLibrary && (
          <div className="a-card px-4 py-1">
            {availablePrograms.map(program => (
              <div key={program.id} className="min-h-14 flex items-center justify-between gap-3 border-b border-(--color-border) last:border-b-0">
                <span className="text-[16px]">{program.name}</span>
                <button className="h-11 px-4 rounded-full bg-(--color-bg-input) text-[15px] font-medium" onClick={() => {
                  if (activePlan) updatePlan({ ...activePlan, programIds: [...activePlan.programIds, program.id] });
                  else addPlan('Varsayılan Plan', [program.id]);
                }}>Ekle</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setShowNewPlanModal(true)} className="h-12 rounded-2xl text-[15px] text-(--color-text-secondary)">Yeni plan oluştur</button>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-(--color-text-secondary)">Aynı antrenmanı haftada birden fazla yapmak için günü kopyalayabilirsin; her gün ayrı kaydedilir. Hareketleri antrenman sırasında da ekleyebilirsin.</p>

      <Modal isOpen={removeId !== null} onClose={() => setRemoveId(null)} title="Günü plandan çıkar"
        message={`${programs.find(p => p.id === removeId)?.name ?? 'Bu gün'} aktif plandan kaldırılacak. Geçmiş ve diğer planlar korunur; mevcut günlerden tekrar ekleyebilirsin.`}
        confirmText="Çıkar" confirmVariant="danger" onConfirm={() => {
          if (activePlan && removeId) updatePlan({ ...activePlan, programIds: activePlan.programIds.filter(id => id !== removeId) });
          setRemoveId(null);
        }} />

      {showPlanModal && (
        <PlanSelectModal
          plans={plans}
          activePlanId={activePlanId}
          onSelect={setActivePlan}
          onClose={() => setShowPlanModal(false)}
          onNewPlan={() => { setShowPlanModal(false); setShowNewPlanModal(true); }}
        />
      )}
      {showNewPlanModal && (
        <NewPlanModal
          programs={programs}
          onConfirm={(name, programIds) => { addPlan(name, programIds); setShowNewPlanModal(false); }}
          onClose={() => setShowNewPlanModal(false)}
        />
      )}
    </div>
  );
}
