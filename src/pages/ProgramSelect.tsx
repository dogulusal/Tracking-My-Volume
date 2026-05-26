import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { usePrograms } from '@/hooks/usePrograms';
import { usePlans } from '@/hooks/usePlans';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { PageContainer } from '@/components/layout/PageContainer';
import type { Plan } from '@/types';

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
      <div className="bg-(--color-bg-card) rounded-2xl border border-(--color-border) w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-(--color-border)">
          <h2 className="text-lg font-black">Plan Seç</h2>
          <button onClick={onClose} className="text-(--color-text-muted) hover:text-(--color-text-primary) text-xl leading-none">✕</button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          {plans.map(plan => (
            <button
              key={plan.id}
              onClick={() => { onSelect(plan.id); onClose(); }}
              className={`w-full text-left rounded-xl p-4 border transition-all hover:scale-[1.01] ${
                plan.id === activePlanId
                  ? 'border-(--color-accent) bg-(--color-accent)/10'
                  : 'border-(--color-border) bg-(--color-bg-input) hover:border-(--color-accent)/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold">{plan.name}</span>
                {plan.id === activePlanId && (
                  <span className="text-xs font-bold text-(--color-accent) bg-(--color-accent)/20 px-2 py-0.5 rounded-full">
                    Aktif
                  </span>
                )}
              </div>
              <p className="text-xs text-(--color-text-muted) mt-0.5">{plan.programIds.length} gün</p>
            </button>
          ))}
          <button
            onClick={() => { onNewPlan(); onClose(); }}
            className="w-full px-4 py-3 border border-dashed border-(--color-border) rounded-xl text-sm font-bold text-(--color-text-muted) hover:text-(--color-text-primary) hover:border-(--color-accent)/50 transition-colors"
          >
            + Yeni Plan Oluştur
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
      <div className="bg-(--color-bg-card) rounded-2xl border border-(--color-border) w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-(--color-border)">
          <h2 className="text-lg font-black">Yeni Plan</h2>
          <button onClick={onClose} className="text-(--color-text-muted) hover:text-(--color-text-primary) text-xl leading-none">✕</button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <input
            type="text"
            placeholder="Plan adı (örn. Dogu Hipertrofi)"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-2.5 bg-(--color-bg-input) border border-(--color-border) rounded-lg text-sm font-semibold text-(--color-text-primary) focus:outline-none focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)"
          />
          <div>
            <p className="text-xs font-bold text-(--color-text-muted) uppercase tracking-widest mb-2">
              Antrenman günleri seç
            </p>
            <div className="flex flex-col gap-2">
              {programs.map(p => (
                <label key={p.id} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="w-4 h-4 accent-(--color-accent)"
                  />
                  <span className="text-sm font-semibold group-hover:text-(--color-accent) transition-colors">
                    {p.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <button
            disabled={!name.trim() || selected.length === 0}
            onClick={() => onConfirm(name.trim(), selected)}
            className="w-full px-5 py-2.5 bg-(--color-accent) hover:bg-(--color-accent-hover) disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-all hover:scale-105 active:scale-95"
          >
            Oluştur
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProgramSelect() {
  const { programs } = usePrograms();
  const { plans, activePlan, activePlanId, activePlanPrograms, setActivePlan, addPlan } = usePlans();
  const { weekLogs, currentWeek } = useWeekLogs();

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);

  const programPreviews = useMemo(() => {
    return activePlanPrograms.map(program => {
      const lastLog = weekLogs
        .filter(log => log.programId === program.id && !log.isHoliday && log.exercises.length > 0)
        .sort((a, b) => b.weekNumber - a.weekNumber)[0] ?? null;

      return { program, lastLog };
    });
  }, [activePlanPrograms, weekLogs]);

  return (
    <PageContainer>
      {/* Plan header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            {activePlan?.name ?? 'Programlar'}
          </h1>
          {plans.length > 1 && (
            <button
              onClick={() => setShowPlanModal(true)}
              className="px-3 py-1 text-xs font-bold bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-(--color-text-secondary) rounded-lg transition-colors"
            >
              Plan değiştir ↓
            </button>
          )}
        </div>
        <p className="text-sm text-(--color-text-muted)">
          {activePlanPrograms.length} antrenman günü
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {programPreviews.map(({ program, lastLog }) => (
          <div
            key={program.id}
            className="card-hover neon-card bg-(--color-bg-card) rounded-xl p-5 border border-(--color-border)"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-extrabold text-lg">{program.name}</h3>
              <Link
                to={`/programs/edit/${program.id}`}
                className="text-xs font-bold text-(--color-text-muted) hover:text-(--color-accent) transition-colors"
              >
                ✏️ Düzenle
              </Link>
            </div>
            <p className="text-sm text-(--color-text-secondary) font-medium mb-3">
              {program.exercises.filter(e => e.isActive).length} aktif egzersiz
            </p>
            <div className="mb-3 rounded-xl border border-(--color-border) bg-(--color-bg-input) p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-(--color-text-muted)">Son hafta</p>
                {lastLog ? (
                  <span className="text-[10px] font-bold text-(--color-accent)">H{lastLog.weekNumber}</span>
                ) : (
                  <span className="text-[10px] font-bold text-(--color-text-muted)">Kayıt yok</span>
                )}
              </div>
              {lastLog ? (
                <div className="space-y-2">
                  {lastLog.exercises.slice(0, 3).map(exercise => (
                    <div key={exercise.exerciseId} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-(--color-text-primary) truncate">{exercise.exerciseName}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {exercise.sets.map((set, index) => (
                            <span
                              key={`${exercise.exerciseId}-${index}`}
                              className="text-[10px] font-set font-bold px-2 py-0.5 rounded-md bg-(--color-bg-card) text-(--color-text-secondary) border border-(--color-border)"
                            >
                              {set.weight}×{set.reps}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {lastLog.exercises.length > 3 && (
                    <p className="text-[10px] font-semibold text-(--color-text-muted)">+{lastLog.exercises.length - 3} egzersiz daha</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-(--color-text-muted)">Bu program için henüz geçmiş kayıt yok.</p>
              )}
            </div>
            <Link
              to={`/workout/${program.id}/week/${currentWeek}`}
              className="inline-block px-4 py-2 bg-(--color-accent) hover:bg-(--color-accent-hover) text-[#050a0a] text-xs font-bold rounded-lg btn-neon"
            >
              Antrenman Gir →
            </Link>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          to="/programs/edit"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-(--color-text-primary) text-sm font-bold rounded-lg transition-all hover:scale-105"
        >
          + Yeni Gün Ekle
        </Link>
        <button
          onClick={() => setShowNewPlanModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-(--color-text-primary) text-sm font-bold rounded-lg transition-all hover:scale-105"
        >
          + Yeni Plan Oluştur
        </button>
      </div>

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
