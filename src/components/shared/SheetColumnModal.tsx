import { useEffect, useRef, useState } from 'react';
import { useSheetMappings } from '@/hooks/useSheetMappings';
import { useGoogleSheets, type GoogleSheetsSettings } from '@/hooks/useGoogleSheets';
import type { ExerciseStatus, Program, WeekLog, PhaseDefinition } from '@/types';
import { buildStatusMap, statusKey } from '@/utils/sheetFormat';
import { formatSets } from '@/utils/formatters';
import { buildColumnRequests, columnLetters, columnStatusColor, parseCellAddress, SHEET_NOTE_COLOR, type ColumnCell, type WeekColumnTarget } from '@/utils/sheetColumn';

interface Mapping { tab: string; header: string; week: number; rows: Record<string, number>; notesRow: number }

export function SheetColumnModal({ program, week, baseWeek, weekLogs, phases, exerciseIds, getCellOverride, onClose, onStage }: {
  program: Program; week: number; baseWeek: number; weekLogs: WeekLog[]; phases: PhaseDefinition[];
  exerciseIds: string[]; getCellOverride: (week: number, id: string) => ExerciseStatus | undefined; onClose: () => void;
  onStage?: (target: WeekColumnTarget, settings: GoogleSheetsSettings) => void;
}) {
  const sheets = useGoogleSheets();
  const [fileDraft, setFileDraft] = useState(sheets.settings.spreadsheetId);
  useEffect(() => setFileDraft(sheets.settings.spreadsheetId), [sheets.settings.spreadsheetId]);
  const mappings = useSheetMappings(sheets.settings.spreadsheetId, baseWeek);
  const [saved] = useState<Mapping | null>(() => mappings.read(program.id));
  const [tab, setTab] = useState(saved?.tab ?? '');
  const [header, setHeader] = useState(() => {
    try {
      if (!saved) return '';
      const address = parseCellAddress(saved.header);
      return `${columnLetters(address.column + week - saved.week)}${address.row}`;
    } catch { return ''; }
  });
  const [rows, setRows] = useState<Record<string, number>>(saved?.rows ?? {});
  const [notesRow, setNotesRow] = useState(saved?.notesRow ?? 0);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const targetFileRef = useRef(sheets.settings.spreadsheetId);
  useEffect(() => {
    if (targetFileRef.current === sheets.settings.spreadsheetId) return;
    targetFileRef.current = sheets.settings.spreadsheetId;
    setTab(''); setHeader(''); setRows({}); setNotesRow(0); setSent(false);
  }, [sheets.settings.spreadsheetId]);
  const log = weekLogs.find(l => l.programId === program.id && l.weekNumber === week);
  const statuses = buildStatusMap({ program, weekLogs, fromWeek: week, toWeek: week, phases, getCellOverride });
  const label = `H${week - baseWeek}`;
  let cells: ColumnCell[] = [];
  let column = 0;
  let validation = '';
  try {
    if (!log) throw new Error('Bu hafta için kayıt yok.');
    const address = parseCellAddress(header);
    column = address.column;
    cells = [{ row: address.row, label: 'Başlık', value: label }];
    for (const [index, id] of exerciseIds.entries()) {
      const exercise = log.exercises.find(e => e.exerciseId === id);
      const name = program.exercises.find(e => e.id === id)?.name ?? exercise?.exerciseName ?? id;
      const status = statuses.get(statusKey(name, `H${week}`)) ?? 'same';
      cells.push({ row: rows[id] ?? address.row + index + 1, label: name,
        value: log.isHoliday ? 'TATİL' : exercise ? formatSets(exercise.sets) || '-' : '-', color: columnStatusColor(status) });
    }
    cells.push({ row: notesRow || address.row + exerciseIds.length + 1, label: 'Açıklama', value: log.notes ?? '', color: log.notes?.trim() ? SHEET_NOTE_COLOR : '#ffffff', kind: 'note' });
    if (cells.slice(1).some(cell => cell.row <= address.row)) throw new Error('Egzersizler ve açıklama başlığın altında olmalı.');
    buildColumnRequests(0, column, cells);
  } catch (e) { validation = e instanceof Error ? e.message : 'Hedefi kontrol et.'; }

  const busy = sheets.busy !== 'idle';
  const inputClass = 'w-full px-3 py-2 border lb-rule rounded-lg bg-(--color-bg-input) text-sm';
  return <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="sheet-column-title">
    <div className="bg-(--color-bg-card) border lb-rule rounded-xl w-full max-w-2xl max-h-[90dvh] overflow-auto p-5">
      <div className="flex items-center justify-between gap-3 mb-3"><h2 id="sheet-column-title" className="text-lg font-semibold">{program.name} · {label} → Google Sheets</h2><button disabled={busy} className="lb-press p-2" aria-label="Kapat" onClick={onClose}>✕</button></div>
      <p className="lb-label mb-4">Önizlemedeki hücreler değer ve renkleriyle güncellenir. Hedef satırları dosyandaki egzersizlerle eşleştir.</p>
      <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
        <div className="text-sm"><span className="lb-label">Kayıtlı dosya: </span><a className="underline" href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheets.settings.spreadsheetId)}/edit`} target="_blank" rel="noreferrer">{sheets.meta?.title ?? 'Referans Google Sheets dosyası'} ↗</a></div>
        <details><summary className="text-sm cursor-pointer">Dosyayı değiştir</summary>
          <label className="block text-sm mt-2">Google Sheets bağlantısı<input className={inputClass} value={fileDraft} onChange={e => setFileDraft(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." /></label>
          <button disabled={!fileDraft.trim()} className="lb-press px-4 py-2 mt-2 border lb-rule rounded-lg text-sm" onClick={() => {
            sheets.setSettings({ spreadsheetId: fileDraft });
            setTab(''); setHeader(''); setRows({}); setNotesRow(0); setSent(false);
          }}>Dosyayı kaydet</button>
        </details>
        <details><summary className="lb-label cursor-pointer">Google bağlantı ayarı</summary>
          <label className="block text-sm mt-2">OAuth Client ID<input className={inputClass} value={sheets.settings.clientId} onChange={e => sheets.setSettings({ clientId: e.target.value })} /></label>
        </details>
        {sheets.connected ? <div className="flex items-center justify-between gap-3 text-sm">
          <span role="status">✓ Google bağlantısı hazır{sheets.meta ? ` · ${sheets.meta.title}` : ''}</span>
          <button className="lb-press px-3 py-2 border lb-rule rounded-lg" onClick={sheets.disconnect}>Bağlantıyı kaldır</button>
        </div> : <button disabled={!sheets.isConfigured} className="lb-press px-4 py-2 border lb-rule rounded-lg text-sm disabled:opacity-40" onClick={() => void sheets.connect()}>Google'a bağlan</button>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Hedef sekme<input className={inputClass} list="sheet-tab-options" value={tab} onChange={e => { setTab(e.target.value); setSent(false); }} placeholder="weak15-28" /></label>
          <datalist id="sheet-tab-options">{sheets.meta?.tabs.map(t => <option key={t.sheetId} value={t.title} />)}</datalist>
          <label className="text-sm">{label} başlık hücresi<input className={inputClass} value={header} onChange={e => { setHeader(e.target.value.toUpperCase()); setSent(false); }} placeholder="W1" /></label>
        </div>
        {cells.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
          <thead><tr className="text-left"><th className="py-2">Alan</th><th>Satır</th><th>Hücre / gönderilecek değer</th></tr></thead>
          <tbody>{cells.map((cell, index) => <tr key={index} className="border-t lb-rule">
            <td className="py-2 pr-2">{cell.label}</td>
            <td className="py-2 pr-2">{index === 0 ? cell.row : <input type="number" min={1} aria-label={`${cell.label} hedef satır`} className={`${inputClass} max-w-20`} value={cell.row} onChange={e => {
              if (index === cells.length - 1) setNotesRow(Number(e.target.value));
              else setRows(prev => ({ ...prev, [exerciseIds[index - 1]]: Number(e.target.value) }));
              setSent(false);
            }} />}</td>
            <td className="py-2"><span className="lb-label block mb-1">{columnLetters(column)}{cell.row}</span><span className="block p-2 whitespace-pre-wrap rounded" style={{ backgroundColor: cell.color, color: cell.color ? cell.color === '#000000' ? '#fff' : '#000' : undefined }}>{cell.value || '(boş)'}</span></td>
          </tr>)}</tbody>
        </table></div>}
        {validation && <p className="text-sm" role="status">{validation}</p>}
        <button disabled={!!validation || !tab.trim() || !sheets.isConfigured || sent} className="lb-press w-full px-5 py-3 bg-(--color-text-primary) text-(--color-bg-primary) rounded-lg font-semibold disabled:opacity-40" onClick={async () => {
          setMessage('');
          const ok = onStage ? true : await sheets.pushColumn(tab.trim(), column, cells);
          if (ok) {
            setSent(true);
            try {
              const mapping: Mapping = { tab: tab.trim(), header, week, rows: Object.fromEntries(exerciseIds.map((id, index) => [id, cells[index + 1].row])), notesRow: cells[cells.length - 1].row };
              mappings.save({ [program.id]: mapping });
            } catch { setMessage('Aktarım tamamlandı; hedef ayarı bu cihazda saklanamadı.'); }
            onStage?.({ tab: tab.trim(), column, cells }, sheets.settings);
          }
        }}>{busy ? 'Gönderiliyor…' : onStage ? 'Eşleştirmeyi haftalık aktarıma ekle' : sent ? '✓ Sütun aktarıldı' : `${label} sütununu gönder`}</button>
      </fieldset>
      {(message || sheets.error || sent) && <p role="status" className="text-sm mt-3">{message || sheets.error || `${label}, ${tab} sekmesine renkleri ve açıklamasıyla aktarıldı.`}</p>}
    </div>
  </div>;
}
