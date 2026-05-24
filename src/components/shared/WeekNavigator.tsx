interface WeekNavigatorProps {
  currentWeek: number;
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
}

export function WeekNavigator({ currentWeek, onPrevious, onNext, canGoPrevious = true, canGoNext = true }: WeekNavigatorProps) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={onPrevious}
        disabled={!canGoPrevious}
        className="p-2 rounded-md hover:bg-(--color-btn-bg) disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Önceki hafta"
      >
        ←
      </button>
      <span className="text-sm font-medium min-w-[80px] text-center">
        Hafta {currentWeek}
      </span>
      <button
        onClick={onNext}
        disabled={!canGoNext}
        className="p-2 rounded-md hover:bg-(--color-btn-bg) disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Sonraki hafta"
      >
        →
      </button>
    </div>
  );
}
