import { useEffect, useId, useMemo, useState } from 'react';
import { useCloudSync } from '@/hooks/useCloudSync';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CloudSyncModal({ isOpen, onClose }: CloudSyncModalProps) {
  const { configured, userId, userEmail, syncStatus, lastSyncedAt, authError, signInWithGoogle, signOut, refreshFromCloud } = useCloudSync();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const titleId = useId();

  // Esc closes it, as Kapat does.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const statusLabel = useMemo(() => {
    if (!configured) return 'Bulut kapalı: Supabase ayarlanmadı';
    if (syncStatus === 'auth_loading') return 'Oturum kontrol ediliyor…';
    if (syncStatus === 'signed_out') return 'Google ile giriş yap';
    if (syncStatus === 'syncing') return 'Buluta kaydediliyor…';
    if (syncStatus === 'synced') return 'Kayıtların hesabında, güncel.';
    if (syncStatus === 'error') return 'Buluta kaydedilemedi; bağlantını kontrol et.';
    return 'Kapalı';
  }, [configured, syncStatus]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setFeedback(null);
    setIsGoogleLoading(true);
    const result = await signInWithGoogle();
    setFeedback(result.message);
    if (!result.ok) setIsGoogleLoading(false);
  };

  const handleRefresh = async () => {
    setFeedback(null);
    setIsRefreshing(true);
    const result = await refreshFromCloud();
    setIsRefreshing(false);
    setFeedback(result.message);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative bg-(--color-bg-card) rounded-lg p-6 max-w-md w-full border border-(--color-border) shadow-xl">
        <h3 id={titleId} className="text-lg font-bold mb-2">Hesap</h3>
        <p className="text-sm text-(--color-text-secondary) mb-4">{statusLabel}</p>

        {!configured && (
          <div className="text-sm text-(--color-text-secondary) mb-4 space-y-2">
            <p>Supabase bağlantısı için bu iki ortam değişkenini gir:</p>
            <p className="font-mono text-xs bg-(--color-bg-secondary) rounded p-2">VITE_SUPABASE_URL</p>
            <p className="font-mono text-xs bg-(--color-bg-secondary) rounded p-2">VITE_SUPABASE_ANON_KEY</p>
          </div>
        )}

        {configured && !userId && (
          <div className="space-y-3 mb-4">
            <button onClick={handleGoogleSignIn} disabled={isGoogleLoading}
              className="lb-press w-full px-4 py-2 rounded-md bg-(--color-text-primary) text-(--color-bg-primary) disabled:opacity-50 text-sm font-semibold">
              {isGoogleLoading ? 'Yönlendiriliyor…' : 'Google ile giriş yap'}
            </button>
          </div>
        )}

        {configured && userId && (
          <div className="space-y-3 mb-4 text-sm">
            <p className="text-(--color-text-secondary)">
              Giriş yapılan hesap: <span className="text-(--color-text-primary) font-semibold">{userEmail ?? 'bu cihazdaki hesap'}</span>
            </p>
            <p className="text-(--color-text-secondary)">
              Son eşitleme: <span className="text-(--color-text-primary)">{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('tr-TR') : 'Henüz yok'}</span>
            </p>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || syncStatus === 'syncing'}
              className="lb-press px-4 py-2 rounded-md bg-(--color-text-primary) text-(--color-bg-primary) disabled:opacity-60 text-sm font-semibold"
            >
              {isRefreshing || syncStatus === 'syncing' ? 'Yenileniyor…' : 'Buluttan yenile'}
            </button>
            <button
              onClick={signOut}
              className="px-4 py-2 rounded-md bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-(--color-text-primary) text-sm"
            >
              Çıkış yap
            </button>
          </div>
        )}

        {(feedback || authError) && (
          <p className="text-xs text-(--color-text-secondary) mb-4">{feedback || authError}</p>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm bg-(--color-btn-bg) hover:bg-(--color-btn-hover)"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
