import {
  computeWorkSpan,
  MAX_PAYMENT_SLOTS,
  type RentSchedule,
} from './taxiRentSchedule';
import type { PaymentCycleResult, PaymentMode } from './taxiPaymentCycle';
import { buildPaymentCycle } from './taxiPaymentCycle';

export type { PaymentMode };

/** جدول ضمان الشهر — يبني على دورة الدفع كل ١٠ أيام */
export function computeRentSchedule(
  entryMonthDate: string,
  monthlyRevenue: number,
  fallbackGuarantee: number,
  workStartDate?: string,
  paymentMode?: PaymentMode,
  paidSlots?: [number, number, number],
  paymentComplete?: boolean
): RentSchedule {
  const monthlyBase = monthlyRevenue > 0 ? monthlyRevenue : fallbackGuarantee;
  const cycle = buildPaymentCycle({
    entryMonthDate,
    monthlyRental: monthlyBase,
    firstPaymentDate: workStartDate,
    mode: paymentMode,
    paidSlots,
    paymentComplete,
  });
  const span = computeWorkSpan(entryMonthDate, workStartDate);
  return {
    monthlyRevenue: monthlyBase,
    workSpan: span,
    totalDue: cycle.totalExpected,
    slotCount: cycle.slotCount,
    slotTargets: [...cycle.slotTargets],
    periodHint: cycle.periodHint,
    dueDatesInMonth: cycle.dueDatesInMonth,
  };
}

/** ثلاث خانات دفع كحد أقصى في قاعدة البيانات — قد تُستخدم دفعة واحدة أو اثنتان فقط */
export const DRIVER_PAYMENT_COUNT = MAX_PAYMENT_SLOTS;

export const DRIVER_PAYMENT_LABELS = ['دفع ضمان ١', 'دفع ضمان ٢', 'دفع ضمان ٣'] as const;

export type DriverPaymentTriple = [number, number, number];

/** @deprecated استخدم computeRentSchedule — يبقى للتوافق مع بيانات قديمة */
export function splitRevenueToInstallments(revenue: number): DriverPaymentTriple {
  const schedule = computeRentSchedule(
    new Date().toISOString().slice(0, 7) + '-01',
    revenue,
    revenue
  );
  return schedule.slotTargets as DriverPaymentTriple;
}

export function sumDriverPayments(payments: DriverPaymentTriple | number[]): number {
  const p = payments as number[];
  return (p[0] ?? 0) + (p[1] ?? 0) + (p[2] ?? 0);
}

export function clampInstallmentPayment(value: number, target: number): number {
  const t = Math.max(0, Math.round(target));
  return Math.max(0, Math.min(Math.round(value), t));
}

export function clampDriverPayments(
  payments: DriverPaymentTriple,
  targets: DriverPaymentTriple
): DriverPaymentTriple {
  return [
    clampInstallmentPayment(payments[0], targets[0]),
    clampInstallmentPayment(payments[1], targets[1]),
    clampInstallmentPayment(payments[2], targets[2]),
  ];
}

function legacyPaidToInstallments(
  legacyPaid: number,
  targets: DriverPaymentTriple,
  activeCount: number
): DriverPaymentTriple {
  let left = Math.max(0, Math.round(legacyPaid));
  const out: number[] = [0, 0, 0];
  for (let i = 0; i < activeCount; i++) {
    const part = Math.min(left, targets[i]);
    out[i] = part;
    left -= part;
  }
  return out as DriverPaymentTriple;
}

export function normalizeDriverPayments(
  raw: number[] | undefined,
  legacyPaid: number | undefined,
  schedule: RentSchedule
): DriverPaymentTriple {
  const targets = schedule.slotTargets as DriverPaymentTriple;
  const activeCount = schedule.slotCount;

  if (raw && raw.length >= DRIVER_PAYMENT_COUNT) {
    const triple: DriverPaymentTriple = [
      Math.max(0, Math.round(raw[0] ?? 0)),
      Math.max(0, Math.round(raw[1] ?? 0)),
      Math.max(0, Math.round(raw[2] ?? 0)),
    ];
    return clampDriverPayments(triple, targets);
  }

  if (legacyPaid != null && legacyPaid > 0) {
    return clampDriverPayments(
      legacyPaidToInstallments(legacyPaid, targets, activeCount),
      targets
    );
  }

  return [0, 0, 0];
}

/** تطبيع الأقساط حسب جدول الشهر (تناسب + دفعات كل ١٠ أيام) */
export function settleDriverPayments(
  raw: number[] | undefined,
  legacyPaid: number | undefined,
  entryMonthDate: string,
  revenue: number,
  fallbackGuarantee: number,
  workStartDate?: string,
  paymentMode?: PaymentMode,
  paymentComplete?: boolean
): DriverPaymentTriple {
  const schedule = computeRentSchedule(
    entryMonthDate,
    revenue,
    fallbackGuarantee,
    workStartDate,
    paymentMode,
    undefined,
    paymentComplete
  );
  return normalizeDriverPayments(raw, legacyPaid, schedule);
}

export function getRentScheduleForEntry(
  entryMonthDate: string,
  revenue: number,
  fallbackGuarantee: number,
  workStartDate?: string,
  paymentMode?: PaymentMode,
  paidSlots?: DriverPaymentTriple,
  paymentComplete?: boolean
): RentSchedule {
  return computeRentSchedule(
    entryMonthDate,
    revenue,
    fallbackGuarantee,
    workStartDate,
    paymentMode,
    paidSlots,
    paymentComplete
  );
}

export function getPaymentCycleForEntry(
  entryMonthDate: string,
  revenue: number,
  fallbackGuarantee: number,
  workStartDate?: string,
  paymentMode?: PaymentMode,
  paidSlots?: DriverPaymentTriple,
  paymentComplete?: boolean
): PaymentCycleResult {
  const monthly = revenue > 0 ? revenue : fallbackGuarantee;
  return buildPaymentCycle({
    entryMonthDate,
    monthlyRental: monthly,
    firstPaymentDate: workStartDate,
    mode: paymentMode,
    paidSlots: paidSlots,
    paymentComplete,
  });
}

/** المطلوب من السائق (بعد التناسب إن وُجد تاريخ بدء) */
export function entryTotalDue(
  revenue: number,
  fallbackGuarantee: number,
  entryMonthDate?: string,
  workStartDate?: string,
  paymentMode?: PaymentMode
): number {
  if (!entryMonthDate) {
    return revenue > 0 ? revenue : fallbackGuarantee;
  }
  return computeRentSchedule(
    entryMonthDate,
    revenue,
    fallbackGuarantee,
    workStartDate,
    paymentMode
  ).totalDue;
}

/** تعبئة الدفعات النشطة بالكامل */
export function fullPaymentsForSchedule(schedule: RentSchedule): DriverPaymentTriple {
  const t = schedule.slotTargets as DriverPaymentTriple;
  return [
    schedule.slotCount >= 1 ? t[0] : 0,
    schedule.slotCount >= 2 ? t[1] : 0,
    schedule.slotCount >= 3 ? t[2] : 0,
  ];
}
