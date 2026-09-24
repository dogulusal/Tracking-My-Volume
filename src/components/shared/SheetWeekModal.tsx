import { useContext, useMemo } from 'react';
import { AppContext } from '@/context/AppContext';
import { programsForPhase } from '@/utils/programVersions';
import { useEffect, useRef, useState } from 'react';
import { useSheetMappings } from '@/hooks/useSheetMappings';
import { usePlans } from '@/hooks/usePlans';
import { buildPhaseSheetLayout, type SheetMapping, type PhaseSheetLayout } from '@/utils/sheetTemplate';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';
import type { ExerciseStatus, PhaseDefinition, Program, WeekLog } from '@/types';
import { SheetColumnModal } from './SheetColumnModal';
import { applySavedOrder } from '@/utils/reorder';
import { buildWeekRequests, columnLetters, columnStatusColor, parseCellAddress, SHEET_NOTE_COLOR, type WeekColumnTarget } from '@/utils/sheetColumn';
import { buildStatusMap, statusKey } from '@/utils/sheetFormat';
import { formatSets } from '@/utils/formatters';

export function SheetWeekModal({ programs: suppliedPrograms, week, baseWeek, weekLogs, phases, rowOrders, getCellOverride, onClose }: {
  programs: Program[]; week: number; baseWeek: number; weekLogs: WeekLog[]; phases: PhaseDefinition[];
  rowOrders?: Record<string, string[]>; getCellOverride: (week: number, id: string) => ExerciseStatus | undefined; onClose: () => void;
}) {
  const sheets = useGoogleSheets();
  const mappings = useSheetMappings(sheets.settings.spreadsheetId, baseWeek);
  const { activePlanPrograms } = usePlans(week);
  const phase = phases.find(p => p.startWeek === baseWeek);
  const ctx = useContext(AppContext);
  const programs = useMemo(() => ctx && phase ? programsForPhase(ctx.state, phase.id) : suppliedPrograms, [ctx, phase, suppliedPrograms]);
  const [templateTitle, setTemplateTitle] = useState(phase?.name ?? 'Yeni faz');
  const [templateCreated, setTemplateCreated] = useState(false);
  const available = programs.filter(p => weekLogs.some(l => l.programId === p.id && l.weekNumber === week));
  const [selected, setSelected] = useState(available.map(p => p.id));
  const [editing, setEditing] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const idsFor = (program: Program) => {
    const log = weekLogs.find(l => l.programId === program.id && l.weekNumber === week);
    return applySavedOrder(log?.exercises.length ? log.exercises.map(e => e.exerciseId) : program.exercises.filter(e => e.isActive).map(e => e.id), rowOrders?.[program.id]);
  };
  const restoreTargets = (createdMappings?: Record<string, SheetMapping>) => {
    const restored: Record<string, WeekColumnTarget> = {};
    for (const program of available) {
      try {
        const mapping = createdMappings?.[program.id] ?? mappings.read(program.id);
        if (!mapping) continue;
        const anchor = parseCellAddress(mapping.header);
        const column = anchor.column + week - mapping.week;
        const log = weekLogs.find(l => l.programId === program.id && l.weekNumber === week)!;
        const statuses = buildStatusMap({ program, weekLogs, fromWeek: week, toWeek: week, phases, getCellOverride });
          const cells = [{ row: anchor.row, label: 'Başlık', value: `H${week - baseWeek}` }, ...[...new Set([...idsFor(program), ...Object.keys(mapping.rows)])].map(id => {
          const exercise = log.exercises.find(e => e.exerciseId === id);
          const name = program.exercises.find(e => e.id === id)?.name ?? exercise?.exerciseName ?? id;
          if (!mapping.rows[id]) throw new Error('Yeni egzersizin satırı eşleştirilmeli.');
          return { row: mapping.rows[id], label: name, value: log.isHoliday ? 'TATİL' : exercise ? formatSets(exercise.sets) || '-' : '-', color: columnStatusColor(statuses.get(statusKey(name, `H${week}`)) ?? 'same') };
        }), { row: mapping.notesRow, label: 'Açıklama', value: log.notes ?? '', color: log.notes?.trim() ? SHEET_NOTE_COLOR : '#ffffff', kind: 'note' as const }];
        buildWeekRequests([{ sheetId: 0, column, cells }]);
        restored[program.id] = { tab: mapping.tab, column, cells };
      } catch { /* Invalid/new mappings need explicit setup. */ }
    }
    return restored;
  };
  const [targets, setTargets] = useState<Record<string, WeekColumnTarget>>(() => restoreTargets());
  useEffect(() => { setTargets(restoreTargets()); setSent(false); }, [mappings.saved]);
  const templatePrograms = [...activePlanPrograms, ...programs.filter(p => !activePlanPrograms.some(active => active.id === p.id))];
  let layout: PhaseSheetLayout | null = null;
  let templateError = '';
  try {
    layout = buildPhaseSheetLayout(templateTitle, baseWeek, templatePrograms, weekLogs.filter(l => l.weekNumber >= baseWeek && (phase?.endWeek == null || l.weekNumber <= phase.endWeek)), rowOrders);
  } catch (e) { templateError = e instanceof Error ? e.message : 'Şablon hazırlanamadı.'; }
  const pending = selected.filter(id => !targets[id]);
  const targetFileRef = useRef(sheets.settings.spreadsheetId);
  useEffect(() => {
    if (targetFileRef.current === sheets.settings.spreadsheetId) return;
    targetFileRef.current = sheets.settings.spreadsheetId;
    setTargets({});
    setSent(false);
    setTemplateCreated(false);
  }, [sheets.settings.spreadsheetId]);
  let conflict = '';
  try {
    const tabIds = new Map<string, number>();
    buildWeekRequests(selected.filter(id => targets[id]).map(id => {
      const target = targets[id];
      if (!tabIds.has(target.tab)) tabIds.set(target.tab, tabIds.size);
      return { ...target, sheetId: tabIds.get(target.tab)! };
    }));
  } catch (e) { conflict = e instanceof Error ? e.message : 'Eşleştirmeleri kontrol et.'; }
  const busy = sheets.busy !== 'idle';
  const program = available.find(p => p.id === editing);
  if (program) return <SheetColumnModal program={program} week={week} baseWeek={baseWeek} weekLogs={weekLogs} phases={phases} exerciseIds={idsFor(program)} getCellOverride={getCellOverride} onClose={() => setEditing(null)} onStage={(target, settings) => {
    const differentFile = settings.spreadsheetId !== sheets.settings.spreadsheetId;
    if (differentFile || settings.clientId !== sheets.settings.clientId) sheets.setSettings(settings);
    setTargets(prev => ({ ...(differentFile ? {} : prev), [program.id]: target }));
    setSent(false); setEditing(null);
  }} />;
  return <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="sheet-week-title">
    <div className="bg-(--color-bg-card) border lb-rule rounded-xl w-full max-w-2xl max-h-[90dvh] overflow-auto p-5">
      <div className="flex items-center justify-between gap-3"><h2 id="sheet-week-title" className="text-lg font-semibold">H{week - baseWeek} · Haftalık Sheets aktarımı</h2><button disabled={busy} onClick={onClose} className="lb-press p-2" aria-label="Kapat">✕</button></div>
      <p className="lb-label my-3">Her antrenmanın hedefini bir kez eşleştir. Alt alta tablolar aynı sekmede olabilir. Kayıt bulunmayan antrenmanlar gönderilmez.</p>
      <fieldset disabled={busy} className="space-y-3">
        <details className="border lb-rule rounded-lg p-3" open={available.length === 0 || pending.length > 0}>
          <summary className="cursor-pointer text-sm font-semibold">Yeni faz için Sheet sekmesi hazırla</summary>
          <p className="lb-label mt-3">Egzersiz · Set · H0, H1… düzeni. Antrenmanlar alt alta; her birinin altında haftalık not satırı. Sekme oluşturulduktan sonra haftayı aşağıdaki Gönder düğmesiyle aktar.</p>
          <a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheets.settings.spreadsheetId)}/edit`} target="_blank" rel="noreferrer" className="block underline text-sm my-3">Kayıtlı Google Sheets dosyasını aç ↗</a>
          <label className="block text-sm">Yeni sekme adı<input value={templateTitle} disabled={templateCreated} onChange={e => setTemplateTitle(e.target.value)} className="w-full px-3 py-2 border lb-rule rounded-lg bg-(--color-bg-input) mt-1" /></label>
          {layout && <div className="mt-3 space-y-3">{layout.blocks.map(block => <details key={block.programId} className="text-sm"><summary className="cursor-pointer">{block.name} · {block.exercises.length} egzersiz · Önizleme</summary>
            <div className="overflow-auto mt-2 rounded-lg border" style={{ borderColor: '#cad5d0' }}>
              <div className="px-3 py-2 text-white font-semibold" style={{ background: '#29323a' }}>{block.name}</div>
              <table className="w-full text-xs border-collapse">
                <thead style={{ background: '#424d57', color: '#fff' }}><tr><th className="p-2 text-left">Egzersiz</th><th>Set</th><th>H0</th><th>H1</th></tr></thead>
                <tbody>{block.exercises.map((ex, index) => <tr key={ex.id} style={{ background: index % 2 ? '#f6f7f8' : '#fff', borderBottom: '1px solid #d9dee2' }}><td className="p-2">{ex.name}</td><td className="text-center">{ex.sets}</td><td /><td /></tr>)}<tr style={{ background: '#fff4d6' }}><td className="p-2 font-medium">Haftalık notlar</td><td /><td /><td /></tr></tbody>
              </table>
            </div>
          </details>)}</div>}
          {templateError && <p className="text-sm mt-2">{templateError}</p>}
          <button disabled={!layout || !sheets.isConfigured || templateCreated} className="lb-press mt-3 px-4 py-3 rounded-lg border lb-rule text-sm font-semibold disabled:opacity-40" onClick={async () => {
            if (!layout) return;
            const preparedLayout = layout;
            if (await sheets.createTemplate(preparedLayout)) {
              mappings.save(preparedLayout.mappings);
              setTargets(restoreTargets(preparedLayout.mappings));
              setTemplateCreated(true); setSent(false);
            }
          }}>{templateCreated ? '✓ Sekme ve eşleştirmeler hazır' : busy ? 'Hazırlanıyor…' : 'Yeni sekmeyi oluştur ve eşleştir'}</button>
        </details>
        {available.map(p => <div key={p.id} className="border lb-rule rounded-lg p-3">
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 font-semibold text-sm"><input type="checkbox" checked={selected.includes(p.id)} onChange={e => { setSelected(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)); setSent(false); }} />{p.name}</label>
            <button className="lb-press px-3 py-2 border lb-rule rounded text-sm" onClick={() => setEditing(p.id)}>{targets[p.id] ? 'Eşleştirmeyi düzenle' : 'Hedefi eşleştir'}</button>
          </div>
          {targets[p.id] && <details className="mt-2 text-sm"><summary className="cursor-pointer">{targets[p.id].tab} · {columnLetters(targets[p.id].column)} sütunu · Önizleme</summary>
            {targets[p.id].cells.map(cell => <div key={cell.row} className="grid grid-cols-2 gap-2 mt-2"><span>{columnLetters(targets[p.id].column)}{cell.row} · {cell.label}</span><span className="p-1 whitespace-pre-wrap" style={{ backgroundColor: cell.color, color: cell.color ? cell.color === '#000000' ? '#fff' : '#000' : undefined }}>{cell.value || '(boş)'}</span></div>)}
          </details>}
        </div>)}
        {pending.length > 0 && <p className="lb-label">{pending.length} antrenmanın hedefi eşleştirilmeli.</p>}
        {conflict && !pending.length && <p className="text-sm">{conflict}</p>}
        <button disabled={!selected.length || pending.length > 0 || !!conflict || sent || !sheets.isConfigured} className="lb-press w-full p-3 rounded-lg bg-(--color-text-primary) text-(--color-bg-primary) font-semibold disabled:opacity-40" onClick={async () => { setSent(await sheets.pushWeek(selected.map(id => targets[id]))); }}>{busy ? 'Gönderiliyor…' : sent ? '✓ Hafta aktarıldı' : `H${week - baseWeek} · ${selected.length} antrenmanı gönder`}</button>
      </fieldset>
      {(sheets.error || sent) && <p role="status" className="text-sm mt-3">{sheets.error ?? 'Seçilen antrenmanlar renkleri ve açıklamalarıyla aktarıldı.'}</p>}
    </div>
  </div>;
}
