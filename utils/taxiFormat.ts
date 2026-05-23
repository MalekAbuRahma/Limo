/** Western digits 0–9 with comma thousands (e.g. 1,234) */
export function formatNumber(
  n: number,
  options?: Intl.NumberFormatOptions
): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    ...options,
  });
}

/** Whole numbers only (e.g. 36, 1100) */
export function formatInteger(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
