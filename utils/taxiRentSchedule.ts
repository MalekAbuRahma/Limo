/** فترة الدفع بالتقويم: كل ١٠ أيام من تاريخ بدء العمل */
export const PAYMENT_INTERVAL_DAYS = 10;

export const MAX_PAYMENT_SLOTS = 3;

export interface WorkSpan {
  year: number;
  month: number;
  daysInMonth: number;
  startDay: number;
  endDay: number;
  daysWorked: number;
}

export interface RentSchedule {
  /** الإيراد الشهري الكامل (صفقة الشهر) */
  monthlyRevenue: number;
  workSpan: WorkSpan;
  /** المطلوب بعد التناسب (أيام التقويم) */
  totalDue: number;
  slotCount: number;
  slotTargets: number[];
  /** نص توضيحي للنموذج */
  periodHint: string;
}

export function paymentSlotLabel(index: number): string {
  const n = index + 1;
  const ar = ['٠', '١', '٢', '٣', '٤'];
  const digit = ar[n] ?? String(n);
  return `دفع ضمان ${digit}`;
}

export function daysInCalendarMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** يوم من تاريخ ISO (YYYY-MM-DD) */
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

/** أيام العمل في شهر السجل (تقويم): من يوم البدء حتى آخر الشهر */
export function computeWorkSpan(entryMonthDate: string, workStartDate?: string): WorkSpan {
  const ym = parseYearMonth(entryMonthDate);
  const now = new Date();
  const year = ym?.year ?? now.getFullYear();
  const month = ym?.month ?? now.getMonth() + 1;
  const dim = daysInCalendarMonth(year, month);

  let startDay = 1;
  if (workStartDate?.trim()) {
    const wsYm = parseYearMonth(workStartDate);
    const wsDay = dayOfMonth(workStartDate);
    if (wsYm && wsYm.year === year && wsYm.month === month) {
      startDay = Math.min(Math.max(1, wsDay), dim);
    }
  }

  const daysWorked = Math.max(1, dim - startDay + 1);
  return {
    year,
    month,
    daysInMonth: dim,
    startDay,
    endDay: dim,
    daysWorked,
  };
}

/** المطلوب = الإيراد الشهري × (أيام العمل ÷ أيام الشهر) */
export function computeProratedDue(monthlyRevenue: number, span: WorkSpan): number {
  const base = Math.max(0, Math.round(monthlyRevenue));
  if (span.daysWorked >= span.daysInMonth) return base;
  return Math.round((base * span.daysWorked) / span.daysInMonth);
}

/** عدد دفعات الضمان (كل ١٠ أيام تقويم، بحد أقصى ٣ خانات في النظام) */
export function computePaymentSlotCount(daysWorked: number): number {
  const d = Math.max(1, daysWorked);
  return Math.min(MAX_PAYMENT_SLOTS, Math.max(1, Math.ceil(d / PAYMENT_INTERVAL_DAYS)));
}

/** تقسيم المطلوب على الدفعات (الباقي في الدفعة الأخيرة) */
export function splitDueToSlots(totalDue: number, slotCount: number): number[] {
  const total = Math.max(0, Math.round(totalDue));
  const n = Math.min(MAX_PAYMENT_SLOTS, Math.max(1, slotCount));
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(i === n - 1 ? base + remainder : base);
  }
  while (out.length < MAX_PAYMENT_SLOTS) out.push(0);
  return out.slice(0, MAX_PAYMENT_SLOTS);
}

export function buildPeriodHint(span: WorkSpan, slotCount: number): string {
  const pad = (d: number) => String(d).padStart(2, '0');
  const start = `${pad(span.startDay)}/${pad(span.month)}/${span.year}`;
  const end = `${pad(span.endDay)}/${pad(span.month)}/${span.year}`;
  if (span.daysWorked >= span.daysInMonth) {
    return `شهر كامل — ${slotCount} دفعة كل ${PAYMENT_INTERVAL_DAYS} أيام`;
  }
  return `${span.daysWorked} يوم عمل (${start} → ${end}) — ${slotCount} دفعة`;
}

export function computeRentSchedule(
  entryMonthDate: string,
  monthlyRevenue: number,
  fallbackGuarantee: number,
  workStartDate?: string
): RentSchedule {
  const monthlyBase = monthlyRevenue > 0 ? monthlyRevenue : fallbackGuarantee;
  const span = computeWorkSpan(entryMonthDate, workStartDate);
  const totalDue = computeProratedDue(monthlyBase, span);
  const slotCount = computePaymentSlotCount(span.daysWorked);
  const slotTargets = splitDueToSlots(totalDue, slotCount);

  return {
    monthlyRevenue: monthlyBase,
    workSpan: span,
    totalDue,
    slotCount,
    slotTargets,
    periodHint: buildPeriodHint(span, slotCount),
  };
}

/** أهداف الدفعات النشطة فقط (طول = slotCount) */
export function activeSlotTargets(schedule: RentSchedule): number[] {
  return schedule.slotTargets.slice(0, schedule.slotCount);
}
