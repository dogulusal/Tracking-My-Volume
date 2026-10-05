import { programVersionAt } from '@/utils/programVersions';
import { useNavigate } from 'react-router-dom';
import { PhaseSettingsModal } from '@/components/shared/PhaseSettingsModal';
import { useState, useMemo, useEffect, useLayoutEffect, useContext, useRef } from 'react';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { useGridPalette } from '@/hooks/useGridPalette';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { WorkoutDetailModal } from '@/components/shared/WorkoutDetailModal';
import { AppContext } from '@/context/AppContext';
import { useReadOnly } from '@/context/ReadOnly';
import { commentsOn, dayNotesOn, useComments } from '@/coach/comments';
import { DayNoteSheet } from '@/coach/DayNoteSheet';
import { buildPhaseGrid, statusFill, type GridRow } from '../../supabase/functions/_shared/historyGrid.mjs';
import { currentPhaseIndex, startedPhases } from '@/utils/phases';
import { trainingStreak } from '@/utils/weekAdvance';
import type { ExerciseLog, SetLog } from '@/types';

const HISTORY_STATE_KEY = 'history-page-state-v1';

/** `embedded`: shown inside another page (an athlete's), which carries the title. */
export function History({ embedded = false }: { embedded?: boolean } = {}) {
  const readOnly = useReadOnly();
  const comments = useComments();
  const [noteWeek, setNoteWeek] = useState<number | null>(null);
  const [showPhaseSettings, setShowPhaseSettings] = useState(false);
  const navigate = useNavigate();
  const { weekLogs, currentWeek, saveWorkout } = useWeekLogs();
  const streak = useMemo(() => trainingStreak(weekLogs, currentWeek), [weekLogs, currentWeek]);
  const palette = useGridPalette();
  const isMobile = useIsMobileDevice();
  const ctx = useContext(AppContext);
  const contextPhases = ctx?.state.phases ?? [];

  // An athlete's grid inside the coach's page keeps its own choice; the
  // coach's own History opens where they left it.
  const [selectedProgramId, setSelectedProgramId] = useState<string>(() => {
    if (embedded) return '';
    try {
      const saved = localStorage.getItem(HISTORY_STATE_KEY);
      if (saved) return (JSON.parse(saved) as { programId?: string }).programId ?? '';
    } catch { /* ignore */ }
    return '';
  });
  const [modalData, setModalData] = useState<{
    exerciseName: string;
    exerciseId: string;
    weekNumber: number;
    currentSets: SetLog[];
    previousSets?: SetLog[];
    previousWeek?: number;
    weekNotes?: string;
    exerciseNote?: string;
    isEmpty: boolean;
  } | null>(null);

  const programLogs = useMemo(
    () => weekLogs
      .filter(w => w.programId === selectedProgramId)
      .sort((a, b) => a.weekNumber - b.weekNumber),
    [weekLogs, selectedProgramId]
  );

  const phases = useMemo(() => startedPhases(contextPhases, currentWeek), [contextPhases, currentWeek]);

  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);
  // Open on the phase that holds the current week.
  useLayoutEffect(() => {
    setSelectedPhaseIdx(currentPhaseIndex(phases, currentWeek));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const currentPhase = phases[selectedPhaseIdx] ?? phases[0];

  // The same grid the automatic Sheet tab is written from.
  const state = ctx?.state;
  const grid = useMemo(() => state && currentPhase ? buildPhaseGrid(state, currentPhase.id) : null, [state, currentPhase]);
  const programs = grid?.programs ?? [];
  const program = programs.find(p => p.id === selectedProgramId);
  // Movements taken out of the program: marked with the week they left, or
  // left out. The automatic Sheet follows the same choice.
  const hideRemoved = state?.hideRemovedExercises ?? false;
  const removedRows = program?.rows.filter(row => row.removedAt !== null) ?? [];
  const shownRows = program?.rows.filter(row => row.removedAt === null || !hideRemoved) ?? [];
  useEffect(() => {
    if (programs.length && !programs.some(p => p.id === selectedProgramId)) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  // Persist last selected program so it survives tab switches
  useEffect(() => {
    if (!embedded) localStorage.setItem(HISTORY_STATE_KEY, JSON.stringify({ programId: selectedProgramId }));
  }, [embedded, selectedProgramId]);

  // Like the Sheet, the grid runs from H0 to the latest week; open it scrolled
  // to the latest weeks.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [grid?.phaseId, program?.id]);

  const baseWeek = currentPhase?.baseWeek ?? 0;
  const getDisplayWeek = (weekNum: number): number => weekNum - baseWeek;

  const exercisePositionForWeek = (week: number, exerciseId: string): number | null => {
    const definition = ctx && programVersionAt(ctx.state, week).programs.find(p => p.id === selectedProgramId);
    const position = definition?.exercises.filter(ex => ex.isActive).findIndex(ex => ex.id === exerciseId) ?? -1;
    if (position >= 0) return position + 1;
    const logged = programLogs.find(log => log.weekNumber === week)?.exercises.findIndex(ex => ex.exerciseId === exerciseId) ?? -1;
    return logged >= 0 ? logged + 1 : null;
  };

  const orderHistoryForExercise = (exerciseId: string): string | null => {
    const periods: { from: number; to: number; position: number }[] = [];
    for (const week of currentPhase?.weeks ?? []) {
      const position = exercisePositionForWeek(week, exerciseId);
      if (position === null) continue;
      const last = periods[periods.length - 1];
      if (last && last.position === position && last.to === week - 1) last.to = week;
      else periods.push({ from: week, to: week, position });
    }
    if (periods.length < 2) return null;
    return periods.map(period => {
      const from = `H${getDisplayWeek(period.from)}`;
      const to = period.to === period.from ? '' : `–H${getDisplayWeek(period.to)}`;
      return `${from}${to}: ${period.position}`;
    }).join(' → ');
  };

  // A week's heading opens that week's fill/edit page.
  const openWeek = (week: number) => navigate(`/workout/${selectedProgramId}/week/${week}?from=history`);

  const getExerciseLog = (weekNumber: number, exerciseId: string): ExerciseLog | undefined => {
    const log = programLogs.find(w => w.weekNumber === weekNumber);
    return log?.exercises.find(e => e.exerciseId === exerciseId);
  };

  const getWeekLog = (weekNumber: number) => programLogs.find(w => w.weekNumber === weekNumber);

  const openCell = (row: GridRow, week: number) => {
    const record = getExerciseLog(week, row.exerciseId);
    // The week the cell's colour was measured against, so the comparison
    // shown is the one that coloured it (hard days are passed over).
    const compareWeek = row.cells.find(cell => cell.week === week)?.compareWeek;
    const previous = compareWeek === undefined ? undefined : getExerciseLog(compareWeek, row.exerciseId);
    setModalData({
      exerciseName: row.name,
      exerciseId: row.exerciseId,
      weekNumber: week,
      currentSets: record?.sets ?? [],
      previousSets: previous?.sets,
      previousWeek: previous && compareWeek !== undefined ? getDisplayWeek(compareWeek) : undefined,
      weekNotes: getWeekLog(week)?.notes,
      exerciseNote: record?.note,
      isEmpty: !record || record.sets.length === 0,
    });
  };

  // The name and set columns keep the Sheet's widths (190 / 52 px). Week
  // columns share the rest of the page, so a phase with a few weeks fills the
  // width instead of leaving it empty; they never get narrower than the
  // Sheet's 128 px (112 on phones), past that the grid scrolls.
  const cols = isMobile ? { name: 116, sets: 40, week: 112 } : { name: 190, sets: 52, week: 128 };
  const rule = `1px solid ${palette.rule}`;
  // Sheets marks the end of its frozen columns with a darker line.
  const frozenEdge = `inset -1px 0 0 ${palette.header}`;
  const weeks = grid?.weeks ?? [];

  const legend = [
    { label: 'İlerleme', fill: palette.improved, edge: 'var(--lb-gain)' },
    { label: 'Aynı', fill: palette.same, edge: 'var(--color-text-secondary)' },
    { label: 'Düşüş', fill: palette.decreased, edge: 'var(--lb-drop)' },
    { label: 'Referans', fill: palette.new, edge: 'var(--lb-ref)' },
  ];

  return (
    <div className={embedded ? '' : 'max-w-5xl xl:max-w-7xl mx-auto px-4 pt-2 pb-8'}>
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          {!embedded && <h1 className="a-display text-[48px]">Geçmiş</h1>}
          <p className="mt-1 text-[14px] text-(--color-text-secondary)">{currentPhase?.label ?? ''}{readOnly ? '' : ' · Sheet ile aynı tablo'}</p>
          {/* The run of weeks this table is made of; moved here from Bugün,
              where it sat oddly beside the day's workout. */}
          {!embedded && streak > 0 && <p className="text-[14px] text-(--color-text-secondary)"><span className="lb-figure font-semibold text-(--color-text-primary)">{streak} hafta</span> üst üste antrenman</p>}
        </div>
        {!readOnly && <button onClick={() => setShowPhaseSettings(true)} className="shrink-0 h-11 px-4 rounded-full bg-(--color-bg-card) text-[15px] font-medium">Fazlar</button>}
      </div>

      {showPhaseSettings && <PhaseSettingsModal phases={contextPhases} currentWeek={currentWeek} onClose={() => setShowPhaseSettings(false)} onSave={updated => {
        ctx?.dispatch({ type: 'SET_PHASES', payload: updated });
        const visible = updated.filter(p => p.startWeek <= currentWeek);
        const index = visible.findIndex(p => currentWeek >= p.startWeek && (p.endWeek === null || currentWeek <= p.endWeek));
        setSelectedPhaseIdx(Math.max(0, index));
        setShowPhaseSettings(false);
      }} />}

      {/* The day, as pills on one line; they scroll sideways when they do not fit. */}
      <div className="mt-4 -mx-4 px-4 flex gap-1.5 overflow-x-auto scrollbar-hide">
        {programs.map(p => (
          <button key={p.id} onClick={() => setSelectedProgramId(p.id)} aria-pressed={selectedProgramId === p.id}
            className={`shrink-0 h-11 px-4 rounded-full text-[15px] whitespace-nowrap ${selectedProgramId === p.id ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'bg-(--color-bg-card) text-(--color-text-secondary)'}`}>
            {p.name}
          </button>
        ))}
      </div>

      {phases.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {phases.map((phase, idx) => (
            <button key={phase.id} onClick={() => setSelectedPhaseIdx(idx)} aria-pressed={selectedPhaseIdx === idx}
              className={`h-11 px-3 text-[14px] ${selectedPhaseIdx === idx ? 'font-semibold underline underline-offset-4' : 'text-(--color-text-secondary)'}`}>
              {phase.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 mb-2.5 px-1 flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-(--color-text-secondary)">
        {legend.map(item => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className="w-[11px] h-[11px] rounded-[3px]" style={{ background: item.fill, boxShadow: `inset 0 0 0 1px ${item.edge}` }} />
            {item.label}
          </span>
        ))}
      </div>

      {!program ? (
        <p className="text-(--color-text-secondary)">Henüz program yok.</p>
      ) : (
        <div className="rounded-[14px] overflow-hidden" style={{ background: palette.canvas, color: palette.ink }}>
          <div ref={scrollRef} className="lb-scroll overflow-x-auto">
            <table className="border-separate border-spacing-0 text-[14px] leading-[19px]"
              style={{ tableLayout: 'fixed', width: '100%', minWidth: cols.name + cols.sets + weeks.length * cols.week }}>
              <colgroup>
                <col style={{ width: cols.name }} />
                <col style={{ width: cols.sets }} />
                {weeks.map(w => <col key={w} />)}
              </colgroup>
              <thead>
                <tr style={{ background: palette.label, color: palette.muted }}>
                  <th className="sticky left-0 z-20 px-3 py-2 text-left text-[12px] font-medium" style={{ background: palette.label }}>Egzersiz</th>
                  <th className="sticky z-20 px-1 py-2 text-center text-[12px] font-medium" style={{ left: cols.name, background: palette.label, boxShadow: frozenEdge }}>Set</th>
                  {weeks.map(w => (
                    <th key={w} className="p-0" style={{ color: w === currentWeek ? palette.ink : palette.muted }}>
                      {readOnly ? (
                        <span className="lb-figure block px-2 py-2 text-[16px] font-semibold text-left">H{getDisplayWeek(w)}</span>
                      ) : (
                        <button onClick={() => openWeek(w)} title={`H${getDisplayWeek(w)} haftasını doldur / düzenle`} className="lb-figure w-full px-2 py-2 text-[16px] font-semibold text-left">
                          H{getDisplayWeek(w)}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.map(row => (
                  <tr key={row.exerciseId}>
                    <td className="sticky left-0 z-10 px-3 py-2 text-left align-middle break-words"
                      style={{ background: palette.canvas, borderTop: rule, color: row.removedAt === null ? undefined : palette.muted }}>
                      {row.name}
                      {row.removedAt !== null && <span className="block text-[12px]">çıkarıldı H{getDisplayWeek(row.removedAt)}</span>}
                    </td>
                    <td className="lb-figure sticky z-10 px-1 py-2 text-center align-middle text-[16px]"
                      style={{ left: cols.name, background: palette.canvas, borderTop: rule, boxShadow: frozenEdge, color: palette.muted }}>{row.defaultSets ?? ''}</td>
                    {row.cells.map(cell => (
                      <td key={cell.week} onClick={() => openCell(row, cell.week)}
                        className="lb-figure cursor-pointer px-2 py-2 text-left align-middle whitespace-pre-line text-[17px] leading-[21px] font-semibold"
                        style={{ background: statusFill(palette, cell.status), borderTop: rule, borderLeft: rule, color: cell.status === 'holiday' ? palette.muted : palette.ink }}>
                        {cell.text}
                        {commentsOn(comments.list, selectedProgramId, cell.week, row.exerciseId).length > 0 && (
                          <span className="block mt-1 text-[11px] leading-none font-medium" style={{ color: palette.muted }}>antrenör yorumu</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} className="sticky left-0 z-10 px-3 py-2 text-left align-middle text-[12px]"
                    style={{ background: palette.note, color: palette.noteText, boxShadow: frozenEdge }}>Haftalık notlar</td>
                  {program.notes.map((note, index) => {
                    const coachNotes = dayNotesOn(comments.list, selectedProgramId, weeks[index]);
                    const open = readOnly ? (comments.add ? () => setNoteWeek(weeks[index]) : undefined) : () => openWeek(weeks[index]);
                    return (
                      <td key={weeks[index]} onClick={open}
                        className={`${open ? 'cursor-pointer ' : ''}px-2 py-2 text-left align-middle text-[12px] whitespace-pre-line break-words`}
                        style={{ background: palette.note, color: palette.noteText }}>
                        {note}
                        {coachNotes.map(item => <span key={item.id} className="block mt-1">Antrenör: {item.text}</span>)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="mt-2 px-1 text-[13px] text-(--color-text-secondary)">75 x 7 +1: 75 kg, 7 tekrar, 1 tekrar daha yapabilirdin · F: tükendin.</p>
      <p className="mt-1 px-1 text-[13px] text-(--color-text-secondary)">
        {readOnly
          ? `Hücreye dokun: setleri gör, yorum yaz.${comments.add ? ' Haftalık notlar satırına dokun: o antrenmana not bırak.' : ''}`
          : 'Hücreye dokun: setleri gör ve düzelt. Hafta başlığına dokun: o haftanın antrenmanını aç.'}
      </p>

      {removedRows.length > 0 && !readOnly && (
        <div className="mt-6 a-card px-4 py-3">
          <div className="flex items-center justify-between gap-3 min-h-11">
            <span className="text-[16px]">Programdan çıkanları gizle</span>
            <button role="switch" aria-checked={hideRemoved} aria-label="Programdan çıkanları gizle"
              onClick={() => ctx?.dispatch({ type: 'SET_HIDE_REMOVED_EXERCISES', payload: !hideRemoved })}
              className="relative w-[52px] h-8 rounded-full" style={{ background: hideRemoved ? 'var(--color-text-primary)' : 'var(--color-bg-input)' }}>
              <span className="absolute top-[3px] w-[26px] h-[26px] rounded-full transition-all"
                style={{ left: hideRemoved ? 23 : 3, background: hideRemoved ? 'var(--color-bg-card)' : 'var(--color-text-secondary)' }} />
            </button>
          </div>
          <p className="text-[13px] text-(--color-text-secondary)">
            {hideRemoved
              ? `Gizli: ${removedRows.map(row => row.name).join(', ')}.`
              : 'Çıkarılan hareketler soluk ve çıkarıldığı haftayla gösteriliyor.'} Sheet de aynısını yazar.
          </p>
        </div>
      )}

      {noteWeek !== null && program && (
        <DayNoteSheet
          title={`${program.name} · H${getDisplayWeek(noteWeek)}`}
          athleteNote={getWeekLog(noteWeek)?.notes}
          notes={dayNotesOn(comments.list, selectedProgramId, noteWeek)}
          onAdd={comments.add ? text => comments.add!({ programId: selectedProgramId, weekNumber: noteWeek, exerciseId: '', exerciseName: '', dayName: program.name, text }) : undefined}
          onClose={() => setNoteWeek(null)} />
      )}

      {/* Workout Detail Modal */}
      <WorkoutDetailModal
        isOpen={modalData !== null}
        onClose={() => setModalData(null)}
        exerciseName={modalData?.exerciseName || ''}
        exerciseId={modalData?.exerciseId || ''}
        weekNumber={modalData ? getDisplayWeek(modalData.weekNumber) : 0}
        currentSets={modalData?.currentSets || []}
        previousSets={modalData?.previousSets}
        previousWeek={modalData?.previousWeek}
        weekNotes={modalData?.weekNotes}
        exerciseNote={modalData?.exerciseNote}
        isEmpty={modalData?.isEmpty || false}
        orderHistory={modalData ? orderHistoryForExercise(modalData.exerciseId) ?? undefined : undefined}
        coachComments={modalData ? commentsOn(comments.list, selectedProgramId, modalData.weekNumber, modalData.exerciseId) : []}
        onComment={modalData && comments.add ? text => comments.add!({
          programId: selectedProgramId, weekNumber: modalData.weekNumber,
          exerciseId: modalData.exerciseId, exerciseName: modalData.exerciseName, text,
        }) : undefined}
        onSaveSets={readOnly ? undefined : (sets) => {
          if (!modalData) return;
          const existingLog = weekLogs.find(
            w => w.programId === selectedProgramId && w.weekNumber === modalData.weekNumber
          );
          const exercises = existingLog?.exercises || [];
          let updatedExercises: typeof exercises;
          if (sets.length === 0) {
            // Remove the exercise entirely when sets are cleared
            updatedExercises = exercises.filter(e => e.exerciseId !== modalData.exerciseId);
          } else {
            updatedExercises = exercises.some(e => e.exerciseId === modalData.exerciseId)
              ? exercises.map(e => e.exerciseId === modalData.exerciseId ? { ...e, sets } : e)
              : [...exercises, { exerciseId: modalData.exerciseId, exerciseName: modalData.exerciseName, sets }];
          }
          saveWorkout({
            weekNumber: modalData.weekNumber,
            programId: selectedProgramId,
            date: existingLog?.date || new Date().toISOString(),
            exercises: updatedExercises,
            notes: existingLog?.notes || '',
            isHoliday: existingLog?.isHoliday || false,
            updatedAt: new Date().toISOString(),
          });
        }}
        onSaveNotes={readOnly ? undefined : (notes) => {
          if (!modalData) return;
          const existingLog = weekLogs.find(
            w => w.programId === selectedProgramId && w.weekNumber === modalData.weekNumber
          );
          saveWorkout({
            weekNumber: modalData.weekNumber,
            programId: selectedProgramId,
            date: existingLog?.date || new Date().toISOString(),
            exercises: existingLog?.exercises || [],
            notes,
            isHoliday: existingLog?.isHoliday || false,
            updatedAt: new Date().toISOString(),
          });
        }}
      />
    </div>
  );
}
