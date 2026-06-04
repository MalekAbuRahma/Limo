/** Month helpers — kept separate to avoid circular imports with taxiPaymentSettings. */

/** شهر بأرقام: MM/YYYY مثل 05/2026 */
export function formatMonthLabel(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length >= 2) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    return `${m}/${y}`;
  }
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${m}/${d.getFullYear()}`;
}

/** رقم الشهر فقط: 1–12 */
export function formatMonthNumber(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length >= 2) return String(parseInt(parts[1], 10));
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return String(d.getMonth() + 1);
}

export function monthKey(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m] = dateStr.split('-');
  return y && m ? `${y}-${m}` : dateStr;
}
