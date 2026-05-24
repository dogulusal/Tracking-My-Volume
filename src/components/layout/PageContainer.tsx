import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  title?: string;
}

export function PageContainer({ children, title }: PageContainerProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20 md:pb-6">
      {title && (
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">
          {title}
        </h1>
      )}
      {children}
    </div>
  );
}
