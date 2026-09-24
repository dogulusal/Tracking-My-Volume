const paths = {
  home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
  programs: 'M8 5H5v16h14V5h-3M8 3h8v4H8ZM8 12h8M8 16h5',
  history: 'M3 12a9 9 0 1 0 3-6M3 3v5h5M12 7v5l3 2',
  chart: 'M4 3v17h17M8 15l4-5 4 2 5-7',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  palette: 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4 2 2 0 0 1 1-4h3a3 3 0 0 0 3-3c0-4-4-7-9-7ZM7 9h.01M10 6h.01M15 6h.01M18 9h.01',
  sun: 'M12 3V1M12 23v-2M3 12H1M23 12h-2M5 5 3 3M21 21l-2-2M5 19l-2 2M21 3l-2 2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20 14A8 8 0 0 1 10 4a9 9 0 1 0 10 10Z',
};

export function Icon({ name, className = 'w-5 h-5' }: { name: keyof typeof paths; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
