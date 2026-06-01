import { useEffect, useState } from 'react';

export function estimateFitPageSize(options: {
  rowHeight: number;
  reservedTop: number;
  min?: number;
  max?: number;
}): number {
  if (typeof window === 'undefined') return options.min ?? 6;
  const available = window.innerHeight - options.reservedTop;
  const rows = Math.floor(available / options.rowHeight);
  return Math.max(options.min ?? 4, Math.min(options.max ?? 10, rows));
}

/** Rows per page so lists fit the viewport without a scroll area. */
export function useFitPageSize(
  options: {
    rowHeight: number;
    reservedTop: number;
    min?: number;
    max?: number;
  },
  deps: unknown[] = []
): number {
  const [size, setSize] = useState(() => estimateFitPageSize(options));

  useEffect(() => {
    const update = () => setSize(estimateFitPageSize(options));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return size;
}
