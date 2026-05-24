import { useMemo, useState } from 'react';
import { useCloudSync } from '@/hooks/useCloudSync';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CloudSyncModal({ isOpen, onClose }: CloudSyncModalProps) {
  const { configured, userEmail, syncStatus, lastSyncedAt, authError, signInWithGithub, signOut, refreshFromCloud } = useCloudSync();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const statusLabel = useMemo(() => {
    if (!configured) return 'Supabase ayarlanmadi';
    if (syncStatus === 'auth_loading') return 'Oturum kontrol ediliyor...';
    if (syncStatus === 'signed_out') return 'GitHub ile giris yap';
    if (syncStatus === 'syncing') return 'Senkronize ediliyor...';
    if (syncStatus === 'synced') return 'Senkron aktif';
    if (syncStatus === 'error') return 'Senkron hatasi';
    return 'Kapali';
  }, [configured, syncStatus]);

  if (!isOpen) return null;

  const handleGithubSignIn = async () => {
    setFeedback(null);
    setIsGithubLoading(true);
    const result = await signInWithGithub();
    setFeedback(result.message);
    if (!result.ok) {
      setIsGithubLoading(false);
    }
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
      <div className="relative bg-(--color-bg-card) rounded-lg p-6 max-w-md w-full border border-(--color-border) shadow-xl">
        <h3 className="text-lg font-bold mb-2">GitHub Senkron</h3>
        <p className="text-sm text-(--color-text-secondary) mb-4">{statusLabel}</p>

        {!configured && (
          <div className="text-sm text-(--color-text-secondary) mb-4 space-y-2">
            <p>Supabase baglantisi icin bu iki env degiskenini gir:</p>
            <p className="font-mono text-xs bg-(--color-bg-secondary) rounded p-2">VITE_SUPABASE_URL</p>
            <p className="font-mono text-xs bg-(--color-bg-secondary) rounded p-2">VITE_SUPABASE_ANON_KEY</p>
          </div>
        )}

        {configured && !userEmail && (
          <div className="space-y-3 mb-4">
            <button
              onClick={handleGithubSignIn}
              disabled={isGithubLoading}
              className="w-full px-4 py-2 rounded-md bg-(--color-accent) hover:bg-(--color-accent-hover) disabled:opacity-50 text-white text-sm font-medium"
            >
              {isGithubLoading ? 'Yonlendiriliyor...' : 'GitHub ile giris yap'}
            </button>
            <p className="text-xs text-(--color-text-secondary) text-center">Ayni GitHub hesabi ile telefonda ve bilgisayarda giris yap.</p>
          </div>
        )}

        {configured && userEmail && (
          <div className="space-y-3 mb-4 text-sm">
            <p className="text-(--color-text-secondary)">
              Giris yapilan hesap: <span className="text-(--color-text-primary) font-semibold">{userEmail}</span>
            </p>
            <p className="text-(--color-text-secondary)">
              Son senkron: <span className="text-(--color-text-primary)">{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('tr-TR') : 'Henuz yok'}</span>
            </p>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || syncStatus === 'syncing'}
              className="px-4 py-2 rounded-md bg-(--color-accent) hover:bg-(--color-accent-hover) disabled:opacity-60 text-white text-sm"
            >
              {isRefreshing || syncStatus === 'syncing' ? 'Yenileniyor...' : 'Buluttan yenile'}
            </button>
            <button
              onClick={signOut}
              className="px-4 py-2 rounded-md bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-(--color-text-primary) text-sm"
            >
              Cikis yap
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
