import { useCallback, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

/** Pure index math for arrow / Home / End navigation in a grid. */
export function nextRovingIndex(
  current: number,
  key: string,
  count: number,
  columns: number,
): number {
  if (count <= 0) return 0;
  const cols = Math.max(1, columns);
  const i = Math.max(0, Math.min(count - 1, current));
  switch (key) {
    case 'ArrowRight':
      return Math.min(count - 1, i + 1);
    case 'ArrowLeft':
      return Math.max(0, i - 1);
    case 'ArrowDown':
      return Math.min(count - 1, i + cols);
    case 'ArrowUp':
      return Math.max(0, i - cols);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return i;
  }
}

export interface UseRovingGridOpts {
  count: number;
  columns: number;
  onPlace: (index: number) => void;
  onOpen?: (index: number) => void;
  onEscape?: () => void;
}

export function useRovingGrid({
  count,
  columns,
  onPlace,
  onOpen,
  onEscape,
}: UseRovingGridOpts) {
  const [activeIndex, setActiveIndex] = useState(0);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'Home' ||
        e.key === 'End'
      ) {
        e.preventDefault();
        setActiveIndex((cur) => nextRovingIndex(cur, e.key, count, columns));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) onOpen?.(activeIndex);
        else onPlace(activeIndex);
        return;
      }
      if (e.key === 'Escape') {
        onEscape?.();
      }
    },
    [activeIndex, count, columns, onPlace, onOpen, onEscape],
  );

  const getItemProps = useCallback(
    (index: number) => ({
      tabIndex: index === activeIndex ? 0 : -1,
      'data-roving-index': index,
      onFocus: () => setActiveIndex(index),
    }),
    [activeIndex],
  );

  return { activeIndex, setActiveIndex, onKeyDown, getItemProps };
}
