/** جدولة الضمان — تفويض إلى دورة الدفع كل ١٠ أيام */

import * as cal from './taxiCalendarIso';

export const PAYMENT_INTERVAL_DAYS = cal.PAYMENT_INTERVAL_DAYS;
export const MAX_PAYMENT_SLOTS = cal.MAX_PAYMENT_SLOTS;
export const daysInCalendarMonth = cal.daysInCalendarMonth;
export const dayOfMonth = cal.dayOfMonth;
export const parseYearMonth = cal.parseYearMonth;
export const formatIsoDateDisplay = cal.formatIsoDateDisplay;
export const addCalendarDaysIso = cal.addCalendarDaysIso;

export interface WorkSpan {
  year: number;
  month: number;
  daysInMonth: number;
  startDay: number;
  endDay: number;
  daysWorked: number;
}

export interface RentSchedule {
  monthlyRevenue: number;
  workSpan: WorkSpan;
  totalDue: number;
  slotCount: number;
  slotTargets: number[];
  periodHint: string;
  /** تواريخ الاستحقاق في شهر السجل (ISO) */
  dueDatesInMonth: string[];
}

export function paymentSlotLabel(index: number): string {
  const n = index + 1;
  const ar = ['٠', '١', '٢', '٣', '٤'];
  const digit = ar[n] ?? String(n);
  return `دفع ضمان ${digit}`;
}

/** تسمية القسط بتاريخ الاستحقاق المحسوب (+10 أيام) */
export function paymentSlotLabelForCycle(slotIndex: number, dueDates: string[]): string {
  if (!dueDates.length) return paymentSlotLabel(slotIndex);

  const isLastSlot = slotIndex === cal.MAX_PAYMENT_SLOTS - 1;
  const hasMergedTail = dueDates.length > cal.MAX_PAYMENT_SLOTS && isLastSlot;

  if (hasMergedTail) {
    return dueDates.slice(slotIndex).map(cal.formatIsoDateDisplay).join(' · ');
  }

  const due = dueDates[slotIndex];
  return due ? cal.formatIsoDateDisplay(due) : paymentSlotLabel(slotIndex);
}

export function computeWorkSpan(entryMonthDate: string, workStartDate?: string): WorkSpan {
  const ym = cal.parseYearMonth(entryMonthDate);
  const now = new Date();
  const year = ym?.year ?? now.getFullYear();
  const month = ym?.month ?? now.getMonth() + 1;
  const dim = cal.daysInCalendarMonth(year, month);

  let startDay = 1;
  if (workStartDate?.trim()) {
    const wsYm = cal.parseYearMonth(workStartDate);
    const wsDay = cal.dayOfMonth(workStartDate);
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

/** @deprecated — استخدم buildPaymentCycle */
export function computeProratedDue(monthlyRevenue: number, span: WorkSpan): number {
  const base = Math.max(0, Math.round(monthlyRevenue));
  if (span.daysWorked >= span.daysInMonth) return base;
  return Math.round((base * span.daysWorked) / span.daysInMonth);
}

/** @deprecated */
export function computePaymentSlotCount(daysWorked: number): number {
  const d = Math.max(1, daysWorked);
  return Math.min(
    cal.MAX_PAYMENT_SLOTS,
    Math.max(1, Math.ceil(d / cal.PAYMENT_INTERVAL_DAYS))
  );
}

/** @deprecated */
export function splitDueToSlots(totalDue: number, slotCount: number): number[] {
  const total = Math.max(0, Math.round(totalDue));
  const n = Math.min(cal.MAX_PAYMENT_SLOTS, Math.max(1, slotCount));
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(i === n - 1 ? base + remainder : base);
  }
  while (out.length < cal.MAX_PAYMENT_SLOTS) out.push(0);
  return out.slice(0, cal.MAX_PAYMENT_SLOTS);
}

export function activeSlotTargets(schedule: RentSchedule): number[] {
  return schedule.slotTargets.slice(0, schedule.slotCount);
}
