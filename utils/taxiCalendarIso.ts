/** أدوات تاريخ ISO مشتركة (بدون اعتماديات دورة الدفع) */
export const PAYMENT_INTERVAL_DAYS = 10;
export const MAX_PAYMENT_SLOTS = 3;

export function daysInCalendarMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function dayOfMonth(dateStr: string): number {
  const parts = dateStr.split('-');
  if (parts.length >= 3) return Math.max(1, parseInt(parts[2], 10) || 1);
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDate();
}

export function parseYearMonth(dateStr: string): { year: number; month: number } | null {
  const parts = dateStr.split('-');
  if (parts.length < 2) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

export function formatIsoDateDisplay(iso: string): string {
  const parts = iso.trim().split('-');
  if (parts.length < 3) return iso;
  const [y, m, d] = parts;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

export function addCalendarDaysIso(iso: string, days: number): string {
  const parts = iso.trim().split('-').map((x) => parseInt(x, 10));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return iso;
  const dt = new Date(parts[0], parts[1] - 1, parts[2] + days, 12, 0, 0);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
