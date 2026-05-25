import { useState } from 'react';
import {
  COLOR_PALETTES,
  getStoredColorTheme,
  setStoredColorTheme,
  applyColorTheme,
  type ThemeColor,
} from '@/utils/colorThemes';

export function ColorThemePicker({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<ThemeColor>(getStoredColorTheme());

  const handleSelect = (id: ThemeColor) => {
    setSelected(id);
    setStoredColorTheme(id);
    applyColorTheme(id);
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-(--color-bg-card) border border-(--color-border) rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-extrabold">Renk Teması</h2>
          <button
            onClick={onClose}
            className="text-(--color-text-secondary) hover:text-(--color-text-primary) text-xl"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {Object.values(COLOR_PALETTES).map(palette => (
            <button
              key={palette.id}
              onClick={() => handleSelect(palette.id)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                selected === palette.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 scale-105'
                  : 'border-(--color-border) hover:border-[var(--color-accent)]/50'
              }`}
            >
              <div
                className="w-10 h-10 rounded-full shadow-lg"
                style={{
                  background: palette.accent,
                  boxShadow: selected === palette.id
                    ? `0 0 16px ${palette.accent}66`
                    : 'none',
                }}
              />
              <span className="text-xs font-bold text-(--color-text-secondary)">
                {palette.name}
              </span>
            </button>
          ))}
        </div>

        <p className="text-xs text-(--color-text-secondary) text-center mt-4">
          Seçtiğin renk anında uygulanır
        </p>
      </div>
    </div>
  );
}
