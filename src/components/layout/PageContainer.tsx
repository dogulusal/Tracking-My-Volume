import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  title?: string;
  /** Inside another page that already gives the width and the gutters. */
  bare?: boolean;
}

export function PageContainer({ children, title, bare = false }: PageContainerProps) {
  return (
    <div className={bare ? '' : 'max-w-5xl mx-auto px-4 py-6 pb-20 md:pb-6'}>
      {title && (
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">
          {title}
        </h1>
      )}
      {children}
    </div>
  );
}
