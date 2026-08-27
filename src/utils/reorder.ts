/**
 * Move the item at `index` by `delta` positions.
 * Returns the original array unchanged when the move would leave the bounds,
 * so callers can use referential equality to skip a no-op state update.
 */
export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length) return items;
  if (target < 0 || target >= items.length) return items;

  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * Apply a saved manual order to a list of ids.
 * Ids present in `savedOrder` come first, in that order; anything not covered
 * (a newly added exercise) keeps its incoming relative position at the end.
 * An empty `savedOrder` leaves `ids` untouched — that is what keeps existing
 * users' History looking exactly as it did before they reordered anything.
 */
export function applySavedOrder(ids: string[], savedOrder: string[] | undefined): string[] {
  if (!savedOrder || savedOrder.length === 0) return ids;

  const present = new Set(ids);
  const ordered = savedOrder.filter(id => present.has(id));
  const seen = new Set(ordered);
  const rest = ids.filter(id => !seen.has(id));
  return [...ordered, ...rest];
}
