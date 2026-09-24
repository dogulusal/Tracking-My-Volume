import { ProgramWeekPicker } from '@/components/shared/ProgramWeekPicker';
import { Link, useSearchParams } from 'react-router-dom';
import { useContext, useMemo, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { usePrograms } from '@/hooks/usePrograms';
import { usePlans } from '@/hooks/usePlans';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { PageContainer } from '@/components/layout/PageContainer';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-(--color-bg-card) rounded-lg border lb-rule w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b lb-rule">
          <h2 className="text-lg font-semibold">Plan seç</h2>
          <button onClick={onClose} aria-label="Kapat" className="lb-press text-(--color-text-secondary) hover:text-(--color-text-primary) text-xl leading-none">✕</button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          {plans.map(plan => (
            <button
              key={plan.id}
              onClick={() => { onSelect(plan.id); onClose(); }}
              className={`lb-press w-full text-left rounded-lg p-4 border ${
                plan.id === activePlanId ? 'lb-rule-strong' : 'lb-rule'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{plan.name}</span>
                {plan.id === activePlanId && (
                  <span className="lb-label font-semibold">Aktif</span>
                )}
              </div>
              <p className="lb-label mt-0.5">{plan.programIds.length} gün</p>
            </button>
          ))}
          <button
            onClick={() => { onNewPlan(); onClose(); }}
            className="lb-press w-full px-4 py-3 border border-dashed lb-rule rounded-lg text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text-primary)"
          >
            + Yeni plan oluştur
          </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-(--color-bg-card) rounded-lg border lb-rule w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b lb-rule">
          <h2 className="text-lg font-semibold">Yeni plan</h2>
          <button onClick={onClose} aria-label="Kapat" className="lb-press text-(--color-text-secondary) hover:text-(--color-text-primary) text-xl leading-none">✕</button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <input
            type="text"
            placeholder="Plan adı (örn. Dogu Hipertrofi)"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-2.5 bg-(--color-bg-input) border lb-rule rounded-lg text-sm focus:outline-none focus:border-(--color-text-primary) placeholder:text-(--color-text-secondary)"
          />
          <div>
            <p className="lb-label mb-2">
              Antrenman günleri seç
            </p>
            <div className="flex flex-col gap-2">
              {programs.map(p => (
                <label key={p.id} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">
                    {p.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <button
            disabled={!name.trim() || selected.length === 0}
            onClick={() => onConfirm(name.trim(), selected)}
            className="lb-press w-full px-5 py-2.5 bg-(--color-text-primary) text-(--color-bg-primary) disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg"
          >
            Oluştur
          </button>
        </div>
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
    <PageContainer>
      <ProgramWeekPicker week={selectedWeek} onChange={week => setParams({ week: String(week) })} allowCopy />
      {/* Plan header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {activePlan?.name ?? 'Programlar'}
          </h1>
          {plans.length > 1 && (
            <button
              onClick={() => setShowPlanModal(true)}
              className="lb-press px-3 py-1 text-xs font-medium border lb-rule rounded-lg"
            >
              Plan değiştir ↓
            </button>
          )}
        </div>
        <p className="lb-label">
          {activePlanPrograms.length} antrenman günü
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {programPreviews.map(({ program, lastLog, visibleExercises, lastWeekLabel }) => (
          <div
            key={program.id}
            className="rounded-lg p-5 border lb-rule"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-base">{program.name}</h3>
              <Link
                to={`/programs/edit/${program.id}?week=${selectedWeek}`}
                className="lb-press text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary)"
              >
                Düzenle
              </Link>
            </div>
            <p className="lb-label mb-3">
              {program.exercises.filter(e => e.isActive).length} aktif egzersiz
            </p>

            <div className="mb-3 rounded-lg border lb-rule bg-(--color-bg-input) p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="lb-label">Program sırası · son kayıt değerleri</p>
                {lastLog ? (
                  <span className="lb-figure text-xs font-semibold text-(--color-text-secondary)">{lastWeekLabel}</span>
                ) : (
                  <span className="lb-label">Kayıt yok</span>
                )}
              </div>
              <div className="space-y-2 max-h-64 overflow-auto">
                  {visibleExercises.map(exercise => (
                    <div key={exercise.exerciseId} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{program.exercises.findIndex(definition => definition.id === exercise.exerciseId) + 1}. {exercise.exerciseName}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {exercise.sets.map((set, index) => (
                            <span
                              key={`${exercise.exerciseId}-${index}`}
                              className="lb-figure text-[10px] font-semibold px-2 py-0.5 rounded-md text-(--color-text-secondary) border lb-rule"
                            >
                              {set.weight}×{set.reps}
                            </span>
                          ))}
                        </div>
                        {!lastLog?.exercises.some(record => record.exerciseId === exercise.exerciseId) && (
                          <p className="lb-label mt-1">{exercise.sets.length ? 'Program başlangıç değeri' : 'Henüz kayıt yok'}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {visibleExercises.length === 0 && <p className="lb-label">Aktif egzersiz yok.</p>}
              </div>
            </div>
            <Link
              to={`/workout/${program.id}/week/${selectedWeek}`}
              className="lb-press inline-block px-4 py-2 bg-(--color-text-primary) text-(--color-bg-primary) text-xs font-semibold rounded-lg"
            >
              Antrenman gir →
            </Link>
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t lb-rule">
              <button className="lb-press text-xs font-medium px-2 py-2 rounded-lg border lb-rule" onClick={() => {
                const base = program.name.replace(/ · \d+$/, '');
                let occurrence = 2;
                while (programs.some(p => p.name === `${base} · ${occurrence}`)) occurrence++;
                addProgram({ name: `${base} · ${occurrence}`, order: programs.length + 1, exercises: program.exercises.map(e => ({ ...e, id: crypto.randomUUID() })) });
              }}>Günü kopyala</button>
              <button className="lb-press text-xs font-medium px-2 py-2 rounded-lg ml-auto" style={{ color: 'var(--lb-drop)' }} onClick={() => setRemoveId(program.id)}>Günü sil</button>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <p className="lb-label mb-4">Aynı antrenmanı haftada birden fazla yapmak için günü kopyalayabilirsin. Her gün ayrı kaydedilir.</p>
      <div className="flex flex-wrap gap-3">
        {availablePrograms.length > 0 && <button onClick={() => setShowLibrary(!showLibrary)} className="lb-press px-5 py-2.5 border lb-rule text-sm rounded-lg">Mevcut günlerden ekle ({availablePrograms.length})</button>}
        <Link
          to={`/programs/edit?week=${selectedWeek}`}
          className="lb-press inline-flex items-center gap-2 px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg"
        >
          + Yeni gün ekle
        </Link>
        <button
          onClick={() => setShowNewPlanModal(true)}
          className="lb-press inline-flex items-center gap-2 px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg"
        >
          + Yeni plan oluştur
        </button>
      </div>

      {showLibrary && <div className="mt-4 border lb-rule rounded-lg p-4 space-y-2">
        {availablePrograms.map(program => <div key={program.id} className="flex items-center justify-between gap-3">
          <span className="text-sm">{program.name}</span>
          <button className="lb-press px-4 py-2 border lb-rule rounded-lg text-sm" onClick={() => {
            if (activePlan) updatePlan({ ...activePlan, programIds: [...activePlan.programIds, program.id] });
            else addPlan('Varsayılan Plan', [program.id]);
          }}>Ekle</button>
        </div>)}
      </div>}
      <Modal isOpen={removeId !== null} onClose={() => setRemoveId(null)} title="Günü plandan sil"
        message={`${programs.find(p => p.id === removeId)?.name ?? 'Bu gün'} aktif plandan kaldırılacak. Geçmiş ve diğer planlar korunur; mevcut günlerden tekrar ekleyebilirsin.`}
        confirmText="Günü sil" confirmVariant="danger" onConfirm={() => {
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
    </PageContainer>
  );
}
