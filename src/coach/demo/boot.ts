import { makeSampleState } from './ownSample';

/**
 * Before the app starts, in the demo build only: the page's language for
 * Turkish casing, a stand-in when the viewer's browser refuses storage, and
 * the coach's own sample workouts so their own tabs are not empty.
 */
export function prepareDemo() {
  document.documentElement.lang = 'tr';
  document.title = 'Antrenör Modu Demo';
  try {
    localStorage.setItem('tmv-storage-check', '1');
    localStorage.removeItem('tmv-storage-check');
  } catch {
    const memory = new Map<string, string>();
    const shim = {
      get length() { return memory.size; },
      key: (index: number) => [...memory.keys()][index] ?? null,
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, String(value)); },
      removeItem: (key: string) => { memory.delete(key); },
      clear: () => memory.clear(),
    };
    Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
  }
  if (!localStorage.getItem('workout-tracker')) {
    localStorage.setItem('workout-tracker', JSON.stringify(makeSampleState()));
    // The app tour's offer would cover the demo's first screen.
    localStorage.setItem('tmv-tur', 'gosterildi');
  }
}
