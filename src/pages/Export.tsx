import { useState, useRef } from 'react';
import { useExportImport } from '@/hooks/useExportImport';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { PageContainer } from '@/components/layout/PageContainer';
import { Modal } from '@/components/shared/Modal';

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
  const { currentWeek } = useWeekLogs();

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
