import { useState, useRef, useMemo, useContext } from 'react';
import { useExportImport } from '@/hooks/useExportImport';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { usePrograms } from '@/hooks/usePrograms';
import { PageContainer } from '@/components/layout/PageContainer';
import { Modal } from '@/components/shared/Modal';
import { AppContext } from '@/context/AppContext';
import { buildSheetTsv, buildMultiProgramTsv, buildSheetRows } from '@/utils/sheetExport';
import { copyText } from '@/utils/clipboard';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';
import { useLastSheetExport } from '@/hooks/useLastSheetExport';

const ALL_PROGRAMS = 'all';

type SheetConfirm =
  | { kind: 'tabs'; tabs: string[] }
  | { kind: 'overwrite'; tabs: string[] };

export function Export() {
  const {
    exportAll,
    exportRange,
    importData,
    importFromText,
    importPdfData,
    resetAll,
    quickBackup,
    backupSettings,
    backupMeta,
    setBackupSettings,
  } = useExportImport();
  const { currentWeek, weekLogs } = useWeekLogs();
  const { programs } = usePrograms();
  const ctx = useContext(AppContext);
  const exerciseRowOrder = ctx?.state.exerciseRowOrder;
  const phases = ctx?.state.phases;

  // Sheets export state
  const [sheetProgramId, setSheetProgramId] = useState<string>(ALL_PROGRAMS);
  const [sheetFrom, setSheetFrom] = useState(0);
  const [sheetTo, setSheetTo] = useState(currentWeek);
  const [showSheetPreview, setShowSheetPreview] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Google Sheets API state
  const sheets = useGoogleSheets();
  const { lastExport, recordExport } = useLastSheetExport();
  const [showSheetSettings, setShowSheetSettings] = useState(false);
  const [sheetConfirm, setSheetConfirm] = useState<SheetConfirm | null>(null);

  const [fromWeek, setFromWeek] = useState(0);
  const [toWeek, setToWeek] = useState(currentWeek);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Text import state
  const [showTextImport, setShowTextImport] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [programName, setProgramName] = useState('');
  const [startWeekInput, setStartWeekInput] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCurrentWeekBackedUp = backupMeta.lastBackupWeek === currentWeek;

  const sheetTsv = useMemo(() => {
    const from = Math.min(sheetFrom, sheetTo);
    const to = Math.max(sheetFrom, sheetTo);
    if (sheetProgramId === ALL_PROGRAMS) {
      return buildMultiProgramTsv(programs, {
        weekLogs,
        fromWeek: from,
        toWeek: to,
        phases,
        rowOrders: exerciseRowOrder,
      });
    }
    const program = programs.find(p => p.id === sheetProgramId);
    if (!program) return '';
    return buildSheetTsv({
      program,
      weekLogs,
      fromWeek: from,
      toWeek: to,
      phases,
      rowOrder: exerciseRowOrder?.[program.id],
    });
  }, [sheetProgramId, sheetFrom, sheetTo, programs, weekLogs, exerciseRowOrder, phases]);

  // One tab per program, named after the program — the same shape the sheet
  // already has. Shares the selection above so both buttons send the same thing.
  const sheetTargets = useMemo(() => {
    const from = Math.min(sheetFrom, sheetTo);
    const to = Math.max(sheetFrom, sheetTo);
    const selected = sheetProgramId === ALL_PROGRAMS
      ? programs
      : programs.filter(p => p.id === sheetProgramId);
    return selected.map(program => ({
      programId: program.id,
      tab: program.name,
      values: buildSheetRows({
        program,
        weekLogs,
        fromWeek: from,
        toWeek: to,
        phases,
        rowOrder: exerciseRowOrder?.[program.id],
      }),
    }));
  }, [sheetProgramId, sheetFrom, sheetTo, programs, weekLogs, exerciseRowOrder, phases]);

  const sentWeek = Math.max(sheetFrom, sheetTo);

  /** Picks up where the sheet was left off, up to the week being logged now. */
  const applySinceLastExport = () => {
    setSheetFrom(lastExport.week === null ? 0 : Math.min(lastExport.week + 1, currentWeek));
    setSheetTo(currentWeek);
    setCopyState('idle');
  };

  const handleSheetPush = async (options: { createMissing?: boolean; overwriteUnmergeable?: boolean } = {}) => {
    const result = await sheets.push(sheetTargets, options);

    if (result.status === 'needs-tabs') {
      setSheetConfirm({ kind: 'tabs', tabs: result.missingTabs });
      return;
    }
    if (result.status === 'needs-overwrite') {
      setSheetConfirm({ kind: 'overwrite', tabs: result.tabs });
      return;
    }
    setSheetConfirm(null);

    if (result.status !== 'done') {
      setImportMessage({ type: 'error', text: result.message });
      return;
    }

    if (result.written.length > 0) recordExport(sentWeek);

    // A partial write is reported as one, not rounded up to success.
    const wrote = result.written.length > 0
      ? `${result.written.join(', ')} sekmesine yazıldı (${result.updatedCells} hücre).`
      : 'Hiçbir sekmeye yazılamadı.';
    const missed = result.failed.length > 0
      ? ` Başarısız: ${result.failed.map(f => `${f.tab} (${f.message})`).join(', ')}.`
      : '';
    setImportMessage({
      type: result.failed.length > 0 ? 'error' : 'success',
      text: wrote + missed,
    });
  };

  const handleSheetCopy = async () => {
    if (!sheetTsv) {
      setImportMessage({ type: 'error', text: 'Kopyalanacak veri yok.' });
      return;
    }
    const copied = await copyText(sheetTsv);
    setCopyState(copied ? 'copied' : 'failed');
    if (copied) recordExport(sentWeek);
    if (!copied) setShowSheetPreview(true);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = importData(content);
      if (result.success) {
        setImportMessage({ type: 'success', text: 'Veri başarıyla yüklendi!' });
      } else {
        setImportMessage({ type: 'error', text: result.error || 'Bilinmeyen hata' });
      }
    };
    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTextImport = () => {
    if (!textInput.trim()) {
      setImportMessage({ type: 'error', text: 'Lütfen tablo verisini yapıştırın.' });
      return;
    }
    if (!programName.trim()) {
      setImportMessage({ type: 'error', text: 'Lütfen program adı girin.' });
      return;
    }
    const result = importFromText(textInput, programName, startWeekInput);
    if (result.success) {
      setImportMessage({ type: 'success', text: `"${programName}" programı başarıyla yüklendi!` });
      setTextInput('');
      setProgramName('');
      setShowTextImport(false);
    } else {
      setImportMessage({ type: 'error', text: result.error || 'Bilinmeyen hata' });
    }
  };

  const handlePdfImport = () => {
    const result = importPdfData();
    if (result.success) {
      setImportMessage({ type: 'success', text: 'PDF verisi başarıyla yüklendi! 5 program ve tüm haftalık kayıtlar eklendi.' });
    } else {
      setImportMessage({ type: 'error', text: result.error || 'Bilinmeyen hata' });
    }
    setShowPdfModal(false);
  };

  const handleReset = () => {
    resetAll();
    setShowResetModal(false);
    setImportMessage({ type: 'success', text: 'Tüm veriler sıfırlandı.' });
  };

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Dışa / içe aktarma</h1>
      </div>
      <div className="space-y-6 max-w-lg">
        {/* Backup automation */}
        <div className="rounded-lg p-5 border lb-rule">
          <h3 className="font-semibold text-base mb-2">Yedek otomasyonu</h3>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
              isCurrentWeekBackedUp
                ? 'text-emerald-300 bg-emerald-900/25 border-emerald-700/50'
                : 'text-amber-300 bg-amber-900/20 border-amber-700/40'
            }`}>
              {isCurrentWeekBackedUp ? `H${currentWeek} yedeklendi` : `H${currentWeek} henuz yedeklenmedi`}
            </span>
          </div>

          <div className="text-xs text-(--color-text-secondary) bg-(--color-bg-input) border border-(--color-border) rounded-lg px-3 py-2 mb-3 space-y-1">
            <p>Hafta bittiginde + Yeni Hafta butonuna bastiginda otomasyon devreye girer.</p>
            <p>Hatirlat modunda sadece uyari gorursun, Otomatik indir modunda JSON yedek otomatik iner.</p>
          </div>

          <p className="text-sm text-(--color-text-secondary) mb-3">
            Son yedek: {backupMeta.lastBackupAt
              ? `${new Date(backupMeta.lastBackupAt).toLocaleString('tr-TR')} (H${backupMeta.lastBackupWeek ?? '?'})`
              : 'Henuz yok'}
          </p>

          {backupMeta.pendingBackupWeek !== null && (
            <p className="text-xs font-semibold text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2 mb-3">
              H{backupMeta.pendingBackupWeek} tamamlandi. Yedek alinmasi onerilir.
            </p>
          )}

          <div className="space-y-3 mb-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-(--color-text-secondary)">Hafta bitince otomasyon aktif</span>
              <input
                type="checkbox"
                checked={backupSettings.enabled}
                onChange={e => setBackupSettings({ enabled: e.target.checked })}
                className="h-4 w-4"
              />
            </label>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-(--color-text-secondary)">Otomatik aksiyon</span>
              <select
                value={backupSettings.mode}
                onChange={e => setBackupSettings({ mode: e.target.value as 'notify' | 'download' })}
                className="px-2 py-1 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
              >
                <option value="notify">Sadece hatirlat</option>
                <option value="download">Otomatik indir</option>
              </select>
            </label>
          </div>

          <button
            onClick={() => {
              quickBackup('quick');
              setImportMessage({ type: 'success', text: 'Hizli yedek indirildi.' });
            }}
            className="lb-press px-5 py-2.5 bg-(--color-text-primary) text-(--color-bg-primary) text-sm font-semibold rounded-lg"
          >
            Hizli Yedek Al
          </button>
        </div>

        {/* Status Message */}
        {importMessage && (
          <div className={`p-4 rounded-xl text-sm font-semibold ${
            importMessage.type === 'success'
              ? 'bg-green-900/50 text-green-300 border border-green-700'
              : 'bg-red-900/50 text-red-300 border border-red-700'
          }`}>
            {importMessage.text}
          </div>
        )}

        {/* Google Sheets */}
        <div className="rounded-lg p-5 border lb-rule">
          <h3 className="font-semibold text-base mb-2">Sheets'e aktar</h3>
          <p className="text-sm text-(--color-text-secondary) mb-3">
            Geçmiş tablosunu panoya kopyalar. Google Sheets'te bir hücreye yapıştırdığında
            satır ve sütunlara kendiliğinden dağılır.
          </p>

          <div className="space-y-3 mb-3">
            <div>
              <label className="lb-label block mb-1">Program:</label>
              <select
                value={sheetProgramId}
                onChange={e => { setSheetProgramId(e.target.value); setCopyState('idle'); }}
                className="w-full px-2 py-1.5 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
              >
                <option value={ALL_PROGRAMS}>Tüm programlar</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <label className="lb-label">Başlangıç:</label>
                <input
                  type="number"
                  value={sheetFrom}
                  onChange={e => { setSheetFrom(Number(e.target.value)); setCopyState('idle'); }}
                  min={0}
                  className="w-16 px-2 py-1 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="lb-label">Bitiş:</label>
                <input
                  type="number"
                  value={sheetTo}
                  onChange={e => { setSheetTo(Number(e.target.value)); setCopyState('idle'); }}
                  min={0}
                  className="w-16 px-2 py-1 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
                />
              </div>
              <button
                onClick={applySinceLastExport}
                className="lb-press px-3 py-1.5 border lb-rule text-xs font-medium rounded-lg"
              >
                Son gönderimden beri
              </button>
            </div>

            <p className="lb-label">
              {lastExport.week === null
                ? 'Sheet henüz hiç güncellenmedi.'
                : `Sheet H${lastExport.week}'e kadar güncel` +
                  (lastExport.at ? ` (${new Date(lastExport.at).toLocaleDateString('tr-TR')}).` : '.')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSheetCopy}
              className="lb-press px-5 py-2.5 bg-(--color-text-primary) text-(--color-bg-primary) text-sm font-semibold rounded-lg"
            >
              📋 Sheets için kopyala
            </button>
            <button
              onClick={() => setShowSheetPreview(v => !v)}
              className="lb-press px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg"
            >
              {showSheetPreview ? 'Önizlemeyi gizle' : 'Önizle'}
            </button>
            {copyState === 'copied' && (
              <span className="text-sm font-semibold text-emerald-300">Kopyalandı</span>
            )}
            {copyState === 'failed' && (
              <span className="text-sm font-semibold text-amber-300">
                Tarayıcı kopyalamayı engelledi — aşağıdaki metni elle seç.
              </span>
            )}
          </div>

          {showSheetPreview && (
            <textarea
              readOnly
              value={sheetTsv}
              rows={10}
              onFocus={e => e.currentTarget.select()}
              className="mt-3 w-full px-3 py-2 bg-(--color-bg-input) border border-(--color-border) rounded text-xs font-mono whitespace-pre resize-y focus:outline-none focus:border-(--color-accent)"
            />
          )}

          {/* Direct write over the Sheets API — same selection, no paste step */}
          <div className="mt-5 pt-5 border-t lb-rule">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h4 className="font-semibold text-sm">Doğrudan gönder</h4>
              <button
                onClick={() => setShowSheetSettings(v => !v)}
                className="lb-label underline underline-offset-2"
              >
                {showSheetSettings ? 'Ayarları gizle' : 'Google ayarları'}
              </button>
            </div>

            <p className="text-sm text-(--color-text-secondary) mb-3">
              Yapıştırmadan, seçili programları sheet'indeki kendi sekmelerine yazar. Yalnızca
              gönderdiğin hafta sütunları güncellenir — sheet'teki eski haftalar yerinde kalır.
            </p>

            {showSheetSettings && (
              <div className="space-y-3 mb-3 bg-(--color-bg-input) border border-(--color-border) rounded-lg p-3">
                <div>
                  <label className="lb-label block mb-1">OAuth istemci kimliği:</label>
                  <input
                    type="text"
                    value={sheets.settings.clientId}
                    onChange={e => sheets.setSettings({ clientId: e.target.value.trim() })}
                    placeholder="...apps.googleusercontent.com"
                    className="w-full px-3 py-2 bg-(--color-bg-primary) border border-(--color-border) rounded text-sm font-mono focus:outline-none focus:border-(--color-accent)"
                  />
                </div>
                <div>
                  <label className="lb-label block mb-1">Sheet adresi veya kimliği:</label>
                  <input
                    type="text"
                    value={sheets.settings.spreadsheetId}
                    onChange={e => sheets.setSettings({ spreadsheetId: e.target.value })}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full px-3 py-2 bg-(--color-bg-primary) border border-(--color-border) rounded text-sm font-mono focus:outline-none focus:border-(--color-accent)"
                  />
                </div>
                <p className="text-xs text-(--color-text-secondary) leading-relaxed">
                  İstemci kimliğini Google Cloud'da kendi projenden alırsın (OAuth istemcisi →
                  Web uygulaması). İzin verilen JavaScript kaynağına bu uygulamanın adresini
                  eklemen gerekir. Kimlik gizli bilgi değildir, bu cihazda saklanır.
                </p>
              </div>
            )}

            {!sheets.isConfigured ? (
              <p className="text-xs font-semibold text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2">
                Bu özellik için önce Google ayarlarını doldur.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleSheetPush()}
                    disabled={sheets.busy !== 'idle'}
                    className="lb-press px-5 py-2.5 bg-(--color-text-primary) text-(--color-bg-primary) text-sm font-semibold rounded-lg disabled:opacity-50"
                  >
                    {sheets.busy === 'sending' ? 'Gönderiliyor…' : "Sheets'e gönder"}
                  </button>
                  <button
                    onClick={() => sheets.connect()}
                    disabled={sheets.busy !== 'idle'}
                    className="lb-press px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg disabled:opacity-50"
                  >
                    {sheets.busy === 'connecting' ? 'Bağlanıyor…' : 'Bağlantıyı sına'}
                  </button>
                </div>

                {sheets.meta && (
                  <p className="mt-2 text-xs text-(--color-text-secondary)">
                    Bağlı: <span className="font-semibold">{sheets.meta.title}</span> —
                    sekmeler: {sheets.meta.tabs.join(', ') || 'yok'}
                  </p>
                )}
                {Object.keys(sheets.settings.tabByProgramId).length > 0 && (
                  <p className="mt-1 text-xs text-(--color-text-secondary)">
                    Eşleşme:{' '}
                    {Object.entries(sheets.settings.tabByProgramId)
                      .map(([programId, tab]) =>
                        `${programs.find(p => p.id === programId)?.name ?? '(silinmiş)'} → ${tab}`)
                      .join(', ')}
                    {' · '}
                    <button onClick={sheets.forgetTabMapping} className="underline underline-offset-2">
                      sıfırla
                    </button>
                  </p>
                )}
                {sheets.lastPushAt && (
                  <p className="mt-1 text-xs text-(--color-text-secondary)">
                    Son gönderim: {new Date(sheets.lastPushAt).toLocaleString('tr-TR')}
                  </p>
                )}
                {sheets.error && (
                  <p className="mt-2 text-xs font-semibold text-amber-300">{sheets.error}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Export All */}
        <div className="rounded-lg p-5 border lb-rule">
          <h3 className="font-semibold text-base mb-2">Tüm veriyi indir</h3>
          <p className="text-sm text-(--color-text-secondary) mb-3">
            Tüm programlar ve antrenman kayıtlarını JSON olarak indir.
          </p>
          <button
            onClick={exportAll}
            className="lb-press px-5 py-2.5 bg-(--color-text-primary) text-(--color-bg-primary) text-sm font-semibold rounded-lg"
          >
            📥 JSON İndir
          </button>
        </div>

        {/* Export Range */}
        <div className="rounded-lg p-5 border lb-rule">
          <h3 className="font-semibold text-base mb-2">Hafta aralığı indir</h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1">
              <label className="lb-label">Başlangıç:</label>
              <input
                type="number"
                value={fromWeek}
                onChange={e => setFromWeek(Number(e.target.value))}
                min={0}
                className="w-16 px-2 py-1 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="lb-label">Bitiş:</label>
              <input
                type="number"
                value={toWeek}
                onChange={e => setToWeek(Number(e.target.value))}
                min={0}
                className="w-16 px-2 py-1 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
              />
            </div>
          </div>
          <button
            onClick={() => exportRange(fromWeek, toWeek)}
            className="lb-press px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg"
          >
            Aralığı İndir
          </button>
        </div>

        {/* Import */}
        <div className="rounded-lg p-5 border lb-rule">
          <h3 className="font-semibold text-base mb-2">Veri yükle (JSON)</h3>
          <p className="text-sm text-(--color-text-secondary) mb-3">
            Daha önce dışa aktarılmış bir JSON dosyasını yükle. Mevcut verinin üzerine yazılır.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="block w-full text-sm text-(--color-text-secondary) file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border file:border-solid file:text-sm file:font-medium file:bg-transparent file:text-(--color-text-primary)"
          />
        </div>

        {/* Text/Spreadsheet Import */}
        <div className="rounded-lg p-5 border lb-rule">
          <h3 className="font-semibold text-base mb-2">Tablo/spreadsheet'ten yükle</h3>
          <p className="text-sm text-(--color-text-secondary) mb-3">
            Excel, Google Sheets veya herhangi bir tablodan kopyala-yapıştır ile veri yükle.
            Format: <code className="text-xs bg-(--color-bg-input) px-1 rounded">Egzersiz | Set | H0 | H1 | H2 | ...</code>
          </p>
          {!showTextImport ? (
            <button
              onClick={() => setShowTextImport(true)}
              className="lb-press px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg"
            >
              📋 Tablo Yapıştır
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="lb-label block mb-1">Program Adı:</label>
                <input
                  type="text"
                  value={programName}
                  onChange={e => setProgramName(e.target.value)}
                  placeholder="Örn: Upper 1, Lower A..."
                  className="w-full px-3 py-2 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
                />
              </div>
              <div>
                <label className="lb-label block mb-1">Başlangıç Haftası:</label>
                <input
                  type="number"
                  value={startWeekInput}
                  onChange={e => setStartWeekInput(Number(e.target.value))}
                  min={0}
                  className="w-20 px-2 py-1 bg-(--color-bg-input) border border-(--color-border) rounded text-sm focus:outline-none focus:border-(--color-accent)"
                />
              </div>
              <div>
                <label className="lb-label block mb-1">Tablo Verisi (Tab/virgül ile ayrılmış):</label>
                <textarea
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  placeholder={"Egzersiz\tSet\tH0\tH1\tH2\nSmith Machine\t1\t45x5\t45x5F\t45x6F\nLateral Ön\t1\t35x6\t35x5F\t35x6F"}
                  rows={8}
                  className="w-full px-3 py-2 bg-(--color-bg-input) border border-(--color-border) rounded text-sm font-mono focus:outline-none focus:border-(--color-accent) resize-y"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleTextImport}
                  className="lb-press px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg"
                >
                  Yükle
                </button>
                <button
                  onClick={() => { setShowTextImport(false); setTextInput(''); }}
                  className="lb-press px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg"
                >
                  İptal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PDF Data Import */}
        <div className="rounded-lg p-5 border lb-rule">
          <h3 className="font-semibold text-base mb-2">PDF başlangıç verisi</h3>
          <p className="text-sm text-(--color-text-secondary) mb-3">
            Orijinal PDF spreadsheet verilerini yükle (5 program, 19+ hafta).
            Mevcut verinin üzerine yazılır.
          </p>
          <button
            onClick={() => setShowPdfModal(true)}
            className="lb-press px-5 py-2.5 border lb-rule text-sm font-medium rounded-lg"
          >
            📄 PDF Verisini Yükle
          </button>
        </div>

        {/* Reset */}
        <div className="rounded-lg p-5 border" style={{ borderColor: 'var(--lb-drop)' }}>
          <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--lb-drop)' }}>Tehlikeli bölge</h3>
          <p className="text-sm text-(--color-text-secondary) mb-3">
            Tüm verileri sıfırla. Bu işlem geri alınamaz.
          </p>
          <button
            onClick={() => setShowResetModal(true)}
            className="lb-press px-5 py-2.5 border text-sm font-semibold rounded-lg"
            style={{ borderColor: 'var(--lb-drop)', color: 'var(--lb-drop)' }}
          >
            🗑️ Veriyi Sıfırla
          </button>
        </div>
      </div>

      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleReset}
        title="Veriyi Sıfırla"
        message="Tüm programlar ve antrenman kayıtları silinecek. Bu işlem geri alınamaz. Emin misiniz?"
        confirmText="Evet, Sıfırla"
        confirmVariant="danger"
      />

      <Modal
        isOpen={sheetConfirm?.kind === 'tabs'}
        onClose={() => setSheetConfirm(null)}
        onConfirm={() => { setSheetConfirm(null); void handleSheetPush({ createMissing: true }); }}
        title="Sekme oluşturulsun mu?"
        message={`Sheet'te şu sekmeler yok: ${sheetConfirm?.tabs.join(', ') ?? ''}. Oluşturup içine yazalım mı? (Mevcut sekmelerin adı programlarınkinden farklıysa, onları eşitlemek daha doğru olur.)`}
        confirmText="Oluştur ve gönder"
        confirmVariant="primary"
      />

      <Modal
        isOpen={sheetConfirm?.kind === 'overwrite'}
        onClose={() => setSheetConfirm(null)}
        onConfirm={() => {
          setSheetConfirm(null);
          void handleSheetPush({ createMissing: true, overwriteUnmergeable: true });
        }}
        title="Sekmenin üzerine yazılsın mı?"
        message={`Şu sekmelerin içeriği bu uygulamanın tablosuna benzemiyor: ${sheetConfirm?.tabs.join(', ') ?? ''}. Birleştirilemiyor; devam edersen içindekiler silinip yerine bu tablo yazılır.`}
        confirmText="Üzerine yaz"
        confirmVariant="danger"
      />

      <Modal
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        onConfirm={handlePdfImport}
        title="PDF Verisini Yükle"
        message="Orijinal PDF spreadsheet'ten 5 program (Upper 1-3, Lower 1-2) ve tüm haftalık kayıtlar yüklenecek. Mevcut verinin üzerine yazılacak. Emin misiniz?"
        confirmText="Evet, Yükle"
        confirmVariant="primary"
      />
    </PageContainer>
  );
}
