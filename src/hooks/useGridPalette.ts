import { useState, useEffect } from 'react';
import { GRID_PALETTE, type GridPalette } from '../../supabase/functions/_shared/historyGrid.mjs';

/**
 * The History grid's colours for the current theme: the automatic Sheet's
 * palette in the light theme, its darker counterpart in the dark one.
 */
export function useGridPalette(): GridPalette {
  // theme.ts flips a class on <html> without any React state, so reading the
  // DOM during render left these colours stale until something else caused a
  // re-render — toggling the theme on History did not recolour the grid.
  // Observing the attribute turns the theme into state the hook reacts to.
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => observer.disconnect();
  }, []);

  return isDark ? GRID_PALETTE.dark : GRID_PALETTE.light;
}
