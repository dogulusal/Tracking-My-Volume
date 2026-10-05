import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  title?: string;
  /** Inside another page that already gives the width and the gutters. */
  bare?: boolean;
}

export function PageContainer({ children, title, bare = false }: PageContainerProps) {
  return (
    // Same width, gutters and top as Programlar and Geçmiş, so a page's title
    // does not jump when moving between them.
    <div className={bare ? '' : 'max-w-5xl xl:max-w-7xl mx-auto px-5 pt-2 pb-8'}>
      {title && (
        <h1 className="a-display text-[48px] mb-4">
          {title}
        </h1>
      )}
      {children}
    </div>
  );
}
