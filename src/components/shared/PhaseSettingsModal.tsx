import { AppContext } from '@/context/AppContext';
import { useContext, useState } from 'react';
import type { PhaseDefinition } from '@/types';
import { normalizePhaseBoundaries } from '@/utils/phases';
import { phaseTransitionError } from '@/utils/programVersions';

export function PhaseSettingsModal({ phases, currentWeek, onSave, onClose }: {
  phases: PhaseDefinition[]; currentWeek: number;
  onSave: (phases: PhaseDefinition[]) => void; onClose: () => void;
}) {
  const ctx = useContext(AppContext);
  const [draft, setDraft] = useState(phases);
  const [error, setError] = useState('');
  const update = (id: string, patch: Partial<PhaseDefinition>) => { setDraft(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p)); setError(''); };
  const preview = (() => { try { return normalizePhaseBoundaries(draft); } catch { return null; } })();
  return <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="phase-settings-title">
    <div className="bg-(--color-bg-card) border lb-rule rounded-xl w-full max-w-xl max-h-[90dvh] overflow-auto p-5">
      <div className="flex items-center justify-between gap-3"><h2 id="phase-settings-title" className="text-lg font-semibold">Faz ayarları</h2><button onClick={onClose} aria-label="Kapat" className="lb-press p-2">✕</button></div>
      <p className="text-sm mt-3">Programda hareket veya gün değiştirmek kendiliğinden faz açmaz. Yeni faz ekleyip programı değiştirdiğin haftayı başlangıç seçebilirsin.</p>
      <p className="lb-label my-3">Şu an toplam hafta {currentWeek}. Başlangıçlar toplam hafta numarasıdır; seçilen hafta kendi fazında H0 olur. Son hafta alanına 20 yazarsan bu faz H20’de biter. Sonraki toplam hafta yeni fazın H0’ı olur. Antrenmanlar ve notlar silinmez.</p>
      {phases.length >= 3 && <div className="border lb-rule rounded-lg p-3 mb-4">
        <p className="text-sm mb-2">Faz 2 H20 kaydı korunur ve tüm setleri, ağırlıkları, rep, RIR, tarih ve notlarıyla Faz 3 H0’a kopyalanır. Şu an H0’da bulunan kayıtlar H1’e taşınır. H1’de çakışan kayıt varsa üzerine yazılmaz. Bu işlem yalnızca bir kez uygulanır.</p>
        <button className="lb-press px-3 py-2 border lb-rule rounded text-sm" onClick={() => {
          if (!ctx) return;
          const payload = { previousPhaseId: phases[1].id, lastWeek: 20, nextId: phases[2]?.id ?? crypto.randomUUID() };
          const issue = phaseTransitionError(ctx.state, payload.previousPhaseId, payload.lastWeek, payload.nextId);
          if (issue) { setError(issue); return; }
          ctx.dispatch({ type: 'CONFIGURE_PHASE_TRANSITION', payload });
          onClose();
        }}>H20’yi H0’a kopyala, mevcut H0’ı H1’e taşı</button>
        <p className="lb-label mt-2">Uygun kayıt bulunduğunda bu düzeltme yeni sürüm açılırken otomatik olarak da uygulanır.</p>
      </div>}
      <div className="space-y-3">{draft.map((phase, index) => <div key={phase.id} className="border lb-rule rounded-lg p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          <label className="text-sm">Faz adı<input value={phase.name} onChange={e => update(phase.id, { name: e.target.value })} className="w-full mt-1 px-3 py-2 border lb-rule rounded bg-(--color-bg-input)" /></label>
          <label className="text-sm">Başlangıç<input type="number" min={0} value={Number.isNaN(phase.startWeek) ? '' : phase.startWeek} disabled={index === 0} onChange={e => update(phase.id, { startWeek: e.target.value === '' ? NaN : Number(e.target.value) })} className="w-full mt-1 px-3 py-2 border lb-rule rounded bg-(--color-bg-input)" /></label>
        </div>
        {index < draft.length - 1 && <label className="block text-sm mt-3">Son hafta (bu fazın H numarası)
          <input aria-label={`${phase.name} son hafta`} type="number" min={0} value={Math.max(0, draft[index + 1].startWeek - phase.startWeek - 1)} onChange={e => {
            if (e.target.value === '') return;
            const last = Number(e.target.value);
            if (Number.isInteger(last) && last >= 0) update(draft[index + 1].id, { startWeek: phase.startWeek + last + 1 });
          }} className="ml-2 w-20 p-2 border lb-rule rounded bg-(--color-bg-input)" />
        </label>}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <span className="lb-label">{preview?.find(p => p.id === phase.id)?.endWeek != null ? `Bitiş: toplam hafta ${preview.find(p => p.id === phase.id)!.endWeek}` : 'Son faz devam eder'}</span>
          {index > 0 && <div className="flex gap-2"><button onClick={() => update(phase.id, { startWeek: currentWeek })} className="lb-press px-2 py-2 text-xs border lb-rule rounded">Mevcut haftadan başlat</button><button onClick={() => setDraft(prev => prev.filter(p => p.id !== phase.id))} className="lb-press px-2 py-2 text-xs border lb-rule rounded">Faz ayrımını kaldır</button></div>}
        </div>
      </div>)}</div>
      <button onClick={() => { setDraft(prev => [...prev, { id: crypto.randomUUID(), name: `Faz ${prev.length + 1}`, startWeek: currentWeek, endWeek: null }]); setError(''); }} className="lb-press my-3 px-3 py-2 border lb-rule rounded-lg text-sm">+ Faz ekle</button>
      <p className="lb-label">Başlangıcı değişen fazın Sheet hedefini yeniden eşleştirmen gerekebilir. Mevcut Sheet hücreleri otomatik taşınmaz.</p>
      {error && <p role="alert" className="text-sm mt-3">{error}</p>}
      <div className="flex justify-end gap-3 mt-4"><button onClick={onClose} className="lb-press px-4 py-2 border lb-rule rounded-lg">İptal</button><button onClick={() => { try { onSave(normalizePhaseBoundaries(draft)); } catch (e) { setError(e instanceof Error ? e.message : 'Fazları kontrol et.'); } }} className="lb-press px-4 py-2 bg-(--color-text-primary) text-(--color-bg-primary) rounded-lg">Kaydet</button></div>
    </div>
  </div>;
}
