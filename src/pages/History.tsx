import { programVersionAt } from '@/utils/programVersions';
import { useNavigate } from 'react-router-dom';
import { PhaseSettingsModal } from '@/components/shared/PhaseSettingsModal';
import { useState, useMemo, useEffect, useLayoutEffect, useContext, useRef } from 'react';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { useGridPalette } from '@/hooks/useGridPalette';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { PageContainer } from '@/components/layout/PageContainer';
import { WorkoutDetailModal } from '@/components/shared/WorkoutDetailModal';
import { AppContext } from '@/context/AppContext';
import { GRID_LEGEND, buildPhaseGrid, statusFill, type GridRow } from '../../supabase/functions/_shared/historyGrid.mjs';
import type { ExerciseLog, SetLog } from '@/types';

type HistoryPhase = {
  id: string;
  label: string;
  weeks: number[];
  baseWeek: number;
};

function buildPhaseLabel(name: string, weeks: number[], baseWeek: number): string {
  if (weeks.length === 0) return `${name} (H0-H0)`;
  const endWeek = weeks[weeks.length - 1] - baseWeek;
  return `${name} (H0-H${endWeek})`;
}

const HISTORY_STATE_KEY = 'history-page-state-v1';
// The automatic Sheet writes in Arial; the grid reads the same.
const SHEET_FONT = 'Arial, Helvetica, sans-serif';

export function History() {
  const [showPhaseSettings, setShowPhaseSettings] = useState(false);
  const navigate = useNavigate();
  const { weekLogs, currentWeek, saveWorkout } = useWeekLogs();
  const palette = useGridPalette();
  const isMobile = useIsMobileDevice();
  const ctx = useContext(AppContext);
  const contextPhases = ctx?.state.phases ?? [];

  const [selectedProgramId, setSelectedProgramId] = useState<string>(() => {
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
    isEmpty: boolean;
  } | null>(null);

  const programLogs = useMemo(
    () => weekLogs
      .filter(w => w.programId === selectedProgramId)
      .sort((a, b) => a.weekNumber - b.weekNumber),
    [weekLogs, selectedProgramId]
  );

  // Phases that have reached their H0, each with the weeks it has so far.
  const phases = useMemo<HistoryPhase[]>(() => contextPhases.map(p => {
    const weeks: number[] = [];
    for (let w = p.startWeek; w <= Math.min(p.endWeek ?? currentWeek, currentWeek); w++) weeks.push(w);
    return { id: p.id, label: buildPhaseLabel(p.name, weeks, p.startWeek), weeks, baseWeek: p.startWeek };
  }).filter(p => p.weeks.length > 0), [contextPhases, currentWeek]);

  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);
  // Open on the phase that holds the current week.
  useLayoutEffect(() => {
    const index = phases.findIndex(p => p.weeks.includes(currentWeek));
    setSelectedPhaseIdx(index >= 0 ? index : Math.max(0, phases.length - 1));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const currentPhase = phases[selectedPhaseIdx] ?? phases[0];

  // The same grid the automatic Sheet tab is written from.
  const state = ctx?.state;
  const grid = useMemo(() => state && currentPhase ? buildPhaseGrid(state, currentPhase.id) : null, [state, currentPhase]);
  const programs = grid?.programs ?? [];
  const program = programs.find(p => p.id === selectedProgramId);
  useEffect(() => {
    if (programs.length && !programs.some(p => p.id === selectedProgramId)) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  // Persist last selected program so it survives tab switches
  useEffect(() => {
    localStorage.setItem(HISTORY_STATE_KEY, JSON.stringify({ programId: selectedProgramId }));
  }, [selectedProgramId]);

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

  // Find nearest previous week in the current phase that has data for this exercise.
  const getPrevExerciseWithinPhase = (weekNum: number, exerciseId: string): { weekNumber: number; log: ExerciseLog } | null => {
    for (let w = weekNum - 1; w >= baseWeek; w--) {
      const prev = getExerciseLog(w, exerciseId);
      if (prev) return { weekNumber: w, log: prev };
    }
    return null;
  };

  const openCell = (row: GridRow, week: number) => {
    const record = getExerciseLog(week, row.exerciseId);
    const previous = getPrevExerciseWithinPhase(week, row.exerciseId);
    setModalData({
      exerciseName: row.name,
      exerciseId: row.exerciseId,
      weekNumber: week,
      currentSets: record?.sets ?? [],
      previousSets: previous?.log.sets,
      previousWeek: previous ? getDisplayWeek(previous.weekNumber) : undefined,
      weekNotes: getWeekLog(week)?.notes,
      isEmpty: !record || record.sets.length === 0,
    });
  };

  // Column widths follow the Sheet (190 / 52 / 128 px), narrower on phones so
  // a week and a half fits beside the frozen columns.
  const cols = isMobile ? { name: 116, sets: 40, week: 112 } : { name: 190, sets: 52, week: 128 };
  const rule = `1px solid ${palette.rule}`;
  // Sheets marks the end of its frozen columns with a darker line.
  const frozenEdge = `inset -1px 0 0 ${palette.header}`;
  const weeks = grid?.weeks ?? [];

  return (
    <PageContainer>
      {/* Title + phase settings */}
      <div className="mb-6 flex flex-wrap gap-3 items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Antrenman Geçmişi</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowPhaseSettings(true)} className="lb-press px-3 py-1.5 border lb-rule text-xs font-semibold rounded-lg">Fazlar</button>
        </div>
      </div>

      {showPhaseSettings && <PhaseSettingsModal phases={contextPhases} currentWeek={currentWeek} onClose={() => setShowPhaseSettings(false)} onSave={updated => {
        ctx?.dispatch({ type: 'SET_PHASES', payload: updated });
        const visible = updated.filter(p => p.startWeek <= currentWeek);
        const index = visible.findIndex(p => currentWeek >= p.startWeek && (p.endWeek === null || currentWeek <= p.endWeek));
        setSelectedPhaseIdx(Math.max(0, index));
        setShowPhaseSettings(false);
      }} />}
      {/* Program Filter — current program marked by underline, not a fill */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {programs.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedProgramId(p.id)}
            className={`lb-press px-3 py-2 rounded-lg text-sm border-b-2 ${
              selectedProgramId === p.id
                ? 'font-semibold border-(--color-text-primary)'
                : 'font-medium border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {phases.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 mb-4">
          {phases.map((phase, idx) => (
            <button
              key={phase.id}
              onClick={() => setSelectedPhaseIdx(idx)}
              className={`lb-press px-3 py-1.5 rounded-lg text-xs ${
                selectedPhaseIdx === idx
                  ? 'font-semibold text-(--color-text-primary)'
                  : 'font-medium text-(--color-text-secondary) hover:text-(--color-text-primary)'
              }`}
            >
              {phase.label}
            </button>
          ))}
        </div>
      )}

      {/* The phase grid, drawn like the automatic Sheet tab */}
      {!program ? (
        <p className="text-(--color-text-secondary)">Henüz program yok.</p>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: rule, background: palette.canvas, color: palette.ink, fontFamily: SHEET_FONT }}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2" style={{ background: palette.title }}>
            <span className="text-[15px] font-bold" style={{ color: palette.titleText }}>{program.name}</span>
            <span className="text-xs" style={{ color: palette.legend }}>{GRID_LEGEND}</span>
          </div>
          <div ref={scrollRef} className="overflow-x-auto [color-scheme:light] dark:[color-scheme:dark]">
            <table className="border-separate border-spacing-0 text-[13px] leading-[18px]"
              style={{ tableLayout: 'fixed', width: cols.name + cols.sets + weeks.length * cols.week }}>
              <colgroup>
                <col style={{ width: cols.name }} />
                <col style={{ width: cols.sets }} />
                {weeks.map(w => <col key={w} style={{ width: cols.week }} />)}
              </colgroup>
              <thead>
                <tr style={{ background: palette.header, color: palette.headerText }}>
                  <th className="sticky left-0 z-20 px-3 py-2 text-left font-bold" style={{ background: palette.header }}>Egzersiz</th>
                  <th className="sticky z-20 px-1 py-2 text-center font-bold" style={{ left: cols.name, background: palette.header, boxShadow: frozenEdge }}>Set</th>
                  {weeks.map(w => (
                    <th key={w} className="p-0 font-bold">
                      <button onClick={() => openWeek(w)} title={`H${getDisplayWeek(w)} haftasını doldur / düzenle`}
                        className="lb-press w-full px-2 py-2 font-bold">
                        H{getDisplayWeek(w)} <span aria-hidden="true" className="opacity-60">✎</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {program.rows.map(row => (
                  <tr key={row.exerciseId}>
                    <td className="sticky left-0 z-10 px-3 py-2 text-left align-middle break-words" style={{ background: palette.label, borderBottom: rule }}>{row.name}</td>
                    <td className="sticky z-10 px-1 py-2 text-center align-middle tabular-nums"
                      style={{ left: cols.name, background: palette.label, borderBottom: rule, boxShadow: frozenEdge }}>{row.defaultSets ?? ''}</td>
                    {row.cells.map(cell => (
                      <td key={cell.week} onClick={() => openCell(row, cell.week)}
                        className="cursor-pointer px-2 py-2 text-center align-middle whitespace-pre-line tabular-nums"
                        style={{ background: statusFill(palette, cell.status), borderBottom: rule, color: cell.status === 'holiday' ? palette.muted : palette.ink }}>
                        {cell.text}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} className="sticky left-0 z-10 px-3 py-2 text-left align-middle text-[12px]"
                    style={{ background: palette.note, color: palette.noteText, boxShadow: frozenEdge }}>HAFTALIK NOTLAR</td>
                  {program.notes.map((note, index) => (
                    <td key={weeks[index]} onClick={() => openWeek(weeks[index])}
                      className="cursor-pointer px-2 py-2 text-center align-middle text-[12px] whitespace-pre-line break-words"
                      style={{ background: palette.note, color: palette.noteText }}>
                      {note}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
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
        isEmpty={modalData?.isEmpty || false}
        orderHistory={modalData ? orderHistoryForExercise(modalData.exerciseId) ?? undefined : undefined}
        onSaveSets={(sets) => {
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
        onSaveNotes={(notes) => {
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
    </PageContainer>
  );
}
