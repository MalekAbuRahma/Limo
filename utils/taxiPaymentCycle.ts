/**
 * دورة دفع السائق — ٣ دفعات كل ١٠ أيام:
 * - يوم المرساة ≤ ٢٢: ٨/١٨/٢٨ في كل شهر تقويمي.
 * - يوم المرساة > ٢٢: فترات متصلة ١٠ أيام تشغيل ثم الاستحقاق التالي في الشهر القادم.
 */
import * as cal from './taxiCalendarIso';

export const PAYMENT_INTERVAL_DAYS = cal.PAYMENT_INTERVAL_DAYS;
export const MAX_PAYMENT_SLOTS = cal.MAX_PAYMENT_SLOTS;

/** شهر محاسبي ثابت ٣٠ يوماً — ٣ دفعات كل ١٠ أيام */
export const ACCOUNTING_MONTH_DAYS = 30;
export const PAYMENTS_PER_ACCOUNTING_MONTH = 3;

/** فوق هذا اليوم من الشهر: دورة متصلة (١٠ أيام تشغيل ثم بداية الضمان التالي) */
export const LATE_ANCHOR_DAY_THRESHOLD = 22;

export function usesRollingPaymentCycle(firstPaymentDate: string): boolean {
  const first = firstPaymentDate?.trim();
  if (!first || !cal.parseYearMonth(first)) return false;
  return cal.dayOfMonth(first) > LATE_ANCHOR_DAY_THRESHOLD;
}

/** بداية الضمان التالي بعد ١٠ أيام تشغيل (شامل) من تاريخ بداية الفترة */
export function nextPeriodStartAfterTenDays(periodStartIso: string): string {
  return cal.addCalendarDaysIso(periodStartIso, PAYMENT_INTERVAL_DAYS + 1);
}

export type PaymentMode = 'advance' | 'deferred';

/** حالة الدفع (إنجليزي للمنطق) */
export type CyclePaymentStatus = 'paid' | 'partial' | 'unpaid';

/** حالة الدفع (عربي للواجهة) */
export type CyclePaymentStatusAr = 'مدفوع' | 'مدفوع جزئياً' | 'غير مدفوع';

export interface PaymentPeriod {
  slotIndex: number;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  expectedAmount: number;
  paidAmount: number;
  remaining: number;
  status: CyclePaymentStatus;
  statusAr: CyclePaymentStatusAr;
}

export interface PaymentCycleResult {
  firstPaymentDate: string;
  monthlyRental: number;
  mode: PaymentMode;
  /** كل تواريخ الاستحقاق في شهر السجل */
  dueDatesInMonth: string[];
  periods: PaymentPeriod[];
  /** أهداف الدفعات (٣ خانات كحد أقصى في قاعدة البيانات) */
  slotTargets: [number, number, number];
  slotCount: number;
  totalExpected: number;
  totalPaid: number;
  totalRemaining: number;
  aggregateStatus: CyclePaymentStatus;
  aggregateStatusAr: CyclePaymentStatusAr;
  periodHint: string;
  /** نفس periodHint لكن بدون قائمة التواريخ — للعرض المختصر */
  shortPeriodHint: string;
  /** قائمة التواريخ فقط مفصولة بنقط — للـ tooltip */
  dueDatesPreview: string;
}

export const PAYMENT_MODE_LABELS: Record<PaymentMode, { ar: string; en: string }> = {
  advance: { ar: 'دفع مقدّم', en: 'Advance' },
  deferred: { ar: 'دفع مؤجّل', en: 'Deferred' },
};

export function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

export function monthBounds(entryMonthDate: string): { start: string; end: string } | null {
  const ym = cal.parseYearMonth(entryMonthDate);
  if (!ym) return null;
  const mm = String(ym.month).padStart(2, '0');
  const dim = cal.daysInCalendarMonth(ym.year, ym.month);
  const dd = String(dim).padStart(2, '0');
  return {
    start: `${ym.year}-${mm}-01`,
    end: `${ym.year}-${mm}-${dd}`,
  };
}

/** تواريخ الاستحقاق داخل شهر تقويمي: يوم المرساة، +١٠، +٢٠ (ضمن أيام الشهر فقط) */
function dueDatesForCalendarMonth(
  year: number,
  month: number,
  anchorDay: number,
  minDateInclusive: string
): string[] {
  const dim = cal.daysInCalendarMonth(year, month);
  const mm = String(month).padStart(2, '0');
  const out: string[] = [];
  for (let i = 0; i < PAYMENTS_PER_ACCOUNTING_MONTH; i++) {
    const day = anchorDay + i * cal.PAYMENT_INTERVAL_DAYS;
    if (day > dim) break;
    const iso = `${year}-${mm}-${String(day).padStart(2, '0')}`;
    if (compareIsoDate(iso, minDateInclusive) < 0) continue;
    out.push(iso);
  }
  return out;
}

/** دورة متصلة: كل فترة ١٠ أيام تشغيل ثم يبدأ الضمان التالي (مثلاً ٢٦/٥ → ٦/٦) */
function generateDueDatesRolling(
  firstPaymentDate: string,
  options?: { from?: string; to?: string; maxCount?: number }
): string[] {
  const first = firstPaymentDate.trim();
  const from = options?.from?.trim();
  const to = options?.to?.trim();
  const maxCount = options?.maxCount ?? 500;

  const out: string[] = [];
  let current = first;

  for (let i = 0; i < maxCount * 2 && out.length < maxCount; i++) {
    if (!from || compareIsoDate(current, from) >= 0) {
      if (!to || compareIsoDate(current, to) <= 0) {
        out.push(current);
        if (out.length >= maxCount) return out;
      }
    }
    const next = nextPeriodStartAfterTenDays(current);
    if (next === current) break;
    current = next;
  }

  return out;
}

/** توليد تواريخ الاستحقاق — نمط شهري أو متصل حسب يوم المرساة */
export function generateDueDates(
  firstPaymentDate: string,
  options?: { from?: string; to?: string; maxCount?: number }
): string[] {
  const first = firstPaymentDate?.trim();
  const startYm = first ? cal.parseYearMonth(first) : null;
  if (!first || !startYm) return [];

  if (usesRollingPaymentCycle(first)) {
    return generateDueDatesRolling(first, options);
  }

  const anchorDay = cal.dayOfMonth(first);
  const from = options?.from?.trim();
  const to = options?.to?.trim();
  const maxCount = options?.maxCount ?? 500;

  const out: string[] = [];
  let y = startYm.year;
  let m = startYm.month;

  for (let guard = 0; guard < 240 && out.length < maxCount; guard++) {
    for (const iso of dueDatesForCalendarMonth(y, m, anchorDay, first)) {
      if (from && compareIsoDate(iso, from) < 0) continue;
      if (to && compareIsoDate(iso, to) > 0) continue;
      out.push(iso);
      if (out.length >= maxCount) return out;
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return out;
}

/** تواريخ الاستحقاق الواقعة داخل شهر السجل */
export function dueDatesInEntryMonth(
  firstPaymentDate: string,
  entryMonthDate: string
): string[] {
  const bounds = monthBounds(entryMonthDate);
  if (!bounds) return [];
  return generateDueDates(firstPaymentDate, {
    from: bounds.start,
    to: bounds.end,
  });
}

/** نطاق الفترة المغطاة عند تاريخ الاستحقاق */
export function periodBoundsForDueDate(dueDate: string, mode: PaymentMode): {
  periodStart: string;
  periodEnd: string;
} {
  if (mode === 'advance') {
    return {
      periodStart: dueDate,
      periodEnd: cal.addCalendarDaysIso(dueDate, cal.PAYMENT_INTERVAL_DAYS - 1),
    };
  }
  return {
    periodStart: cal.addCalendarDaysIso(dueDate, -cal.PAYMENT_INTERVAL_DAYS),
    periodEnd: cal.addCalendarDaysIso(dueDate, -1),
  };
}

/** عدد الأيام inclusive بين تاريخين ISO */
export function daysInclusive(startIso: string, endIso: string): number {
  if (compareIsoDate(endIso, startIso) < 0) return 0;
  let count = 0;
  let d = startIso;
  while (compareIsoDate(d, endIso) <= 0 && count < 400) {
    count++;
    if (d === endIso) break;
    d = cal.addCalendarDaysIso(d, 1);
  }
  return count;
}

/** مبلغ دفعة واحدة = الإيجار الشهري ÷ ٣ (شهر محاسبي ٣٠ يوماً) */
export function fixedPeriodAmount(monthlyRental: number): number {
  const monthly = Math.max(0, Math.round(monthlyRental));
  if (monthly === 0) return 0;
  return Math.round(monthly / PAYMENTS_PER_ACCOUNTING_MONTH);
}

/** مبالغ الاستحقاقات في شهر السجل — ٣ دفعات متساوية (الباقي في الأخيرة عند ٣ تواريخ) */
export function periodAmountsForDueDates(
  dueDates: string[],
  monthlyRental: number
): number[] {
  const n = dueDates.length;
  if (n === 0) return [];
  const monthly = Math.max(0, Math.round(monthlyRental));
  const base = fixedPeriodAmount(monthly);
  if (n === PAYMENTS_PER_ACCOUNTING_MONTH) {
    const last = monthly - base * (PAYMENTS_PER_ACCOUNTING_MONTH - 1);
    return [base, base, last];
  }
  return dueDates.map(() => base);
}

/** @deprecated — استخدم fixedPeriodAmount / periodAmountsForDueDates */
export function computePeriodExpectedAmount(
  monthlyRental: number,
  periodStart: string,
  periodEnd: string
): number {
  void periodStart;
  void periodEnd;
  return fixedPeriodAmount(monthlyRental);
}

export function resolvePeriodPaymentStatus(
  paid: number,
  expected: number
): { status: CyclePaymentStatus; statusAr: CyclePaymentStatusAr } {
  const exp = Math.max(0, Math.round(expected));
  const p = Math.max(0, Math.round(paid));
  if (exp <= 0 || p >= exp) {
    return { status: 'paid', statusAr: 'مدفوع' };
  }
  if (p > 0) {
    return { status: 'partial', statusAr: 'مدفوع جزئياً' };
  }
  return { status: 'unpaid', statusAr: 'غير مدفوع' };
}

export function resolveAggregatePaymentStatus(
  totalPaid: number,
  totalExpected: number,
  paymentComplete?: boolean
): { status: CyclePaymentStatus; statusAr: CyclePaymentStatusAr } {
  if (paymentComplete) {
    return { status: 'paid', statusAr: 'مدفوع' };
  }
  return resolvePeriodPaymentStatus(totalPaid, totalExpected);
}

/** دمج فترات زائدة (أكثر من ٣) في الهدف الأخير */
function mergePeriodsToSlots(
  periodAmounts: number[]
): { slotTargets: [number, number, number]; slotCount: number } {
  const n = periodAmounts.length;
  if (n === 0) {
    return { slotTargets: [0, 0, 0], slotCount: 0 };
  }
  if (n <= cal.MAX_PAYMENT_SLOTS) {
    const targets: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < n; i++) targets[i] = periodAmounts[i];
    return { slotTargets: targets, slotCount: n };
  }
  const targets: [number, number, number] = [
    periodAmounts[0],
    periodAmounts[1],
    periodAmounts[2] + periodAmounts.slice(3).reduce((s, x) => s + x, 0),
  ];
  return { slotTargets: targets, slotCount: cal.MAX_PAYMENT_SLOTS };
}

function distributePaidChronologically(
  expectedAmounts: number[],
  totalPaid: number
): number[] {
  let remaining = Math.max(0, Math.round(totalPaid));
  return expectedAmounts.map((exp) => {
    const applied = Math.min(remaining, exp);
    remaining -= applied;
    return applied;
  });
}

export function buildPaymentCycle(input: {
  entryMonthDate: string;
  monthlyRental: number;
  firstPaymentDate?: string;
  mode?: PaymentMode;
  paidSlots?: [number, number, number];
  paymentComplete?: boolean;
}): PaymentCycleResult {
  const bounds = monthBounds(input.entryMonthDate);
  const monthlyRental = Math.max(0, Math.round(input.monthlyRental));
  const mode = input.mode ?? 'advance';

  const firstPaymentDate =
    input.firstPaymentDate?.trim() || bounds?.start || input.entryMonthDate.slice(0, 10);

  const dueDates = bounds
    ? dueDatesInEntryMonth(firstPaymentDate, input.entryMonthDate)
    : [];

  const periodAmounts = periodAmountsForDueDates(dueDates, monthlyRental);

  const { slotTargets, slotCount } = mergePeriodsToSlots(periodAmounts);
  const paidSlots: [number, number, number] = [
    Math.max(0, Math.round(input.paidSlots?.[0] ?? 0)),
    Math.max(0, Math.round(input.paidSlots?.[1] ?? 0)),
    Math.max(0, Math.round(input.paidSlots?.[2] ?? 0)),
  ];

  const periodDefs = dueDates.map((dueDate, i) => ({
    dueDate,
    expectedAmount: periodAmounts[i],
    ...periodBoundsForDueDate(dueDate, mode),
  }));

  const totalPaidRaw = paidSlots[0] + paidSlots[1] + paidSlots[2];
  const paidPerPeriod = distributePaidChronologically(periodAmounts, totalPaidRaw);

  const periods: PaymentPeriod[] = periodDefs.map((p, i) => {
    const paidAmount = paidPerPeriod[i] ?? 0;
    const remaining = Math.max(0, p.expectedAmount - paidAmount);
    const { status, statusAr } = resolvePeriodPaymentStatus(paidAmount, p.expectedAmount);
    return {
      slotIndex: Math.min(i, cal.MAX_PAYMENT_SLOTS - 1),
      dueDate: p.dueDate,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      expectedAmount: p.expectedAmount,
      paidAmount,
      remaining,
      status,
      statusAr,
    };
  });

  const totalExpected = periodAmounts.reduce((s, x) => s + x, 0);
  const totalPaid = Math.min(totalPaidRaw, totalExpected);
  const totalRemaining = Math.max(0, totalExpected - totalPaid);
  const { status: aggregateStatus, statusAr: aggregateStatusAr } =
    resolveAggregatePaymentStatus(totalPaid, totalExpected, input.paymentComplete);

  const modeLabel = PAYMENT_MODE_LABELS[mode].ar;
  const duePreview =
    dueDates.length > 0
      ? dueDates.map(cal.formatIsoDateDisplay).join(' · ')
      : '—';
  const rolling = usesRollingPaymentCycle(firstPaymentDate);
  const noDateMsg = !input.firstPaymentDate?.trim()
    ? 'حدّد تاريخ أول دفعة في إعدادات السيارة'
    : 'لا استحقاقات في شهر هذا السجل — راجع شهر السجل أو تاريخ أول دفعة';
  const shortBase = rolling
    ? `${modeLabel} — ${dueDates.length} استحقاق (١٠ أيام تشغيل متصلة)`
    : `${modeLabel} — ${dueDates.length} استحقاق (شهر ٣٠ يوم)`;
  const periodHint = dueDates.length === 0 ? noDateMsg : `${shortBase}: ${duePreview}`;
  const shortPeriodHint = dueDates.length === 0 ? noDateMsg : shortBase;
  const dueDatesPreview = duePreview;

  return {
    firstPaymentDate,
    monthlyRental,
    mode,
    dueDatesInMonth: dueDates,
    periods,
    slotTargets,
    slotCount,
    totalExpected,
    totalPaid,
    totalRemaining,
    aggregateStatus,
    aggregateStatusAr,
    periodHint,
    shortPeriodHint,
    dueDatesPreview,
  };
}

/** التاريخ الاستحقاق التالي في تسلسل الدورة (الدفعة الثانية = +١٠ أيام في نفس الشهر، إلخ) */
export function nextDueDateFrom(firstPaymentDate: string, steps = 1): string | null {
  const dates = generateDueDates(firstPaymentDate, { maxCount: steps + 1 });
  return dates[steps] ?? null;
}

export function formatNextDueHint(firstPaymentDate: string): string | null {
  const next = nextDueDateFrom(firstPaymentDate, 1);
  if (!next) return null;
  if (usesRollingPaymentCycle(firstPaymentDate)) {
    return `موعد الاستحقاق التالي (بعد ${cal.PAYMENT_INTERVAL_DAYS} أيام تشغيل): ${cal.formatIsoDateDisplay(next)}`;
  }
  return `موعد الاستحقاق التالي (+${cal.PAYMENT_INTERVAL_DAYS} أيام): ${cal.formatIsoDateDisplay(next)}`;
}
