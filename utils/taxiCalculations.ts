import {
  ExpenseBreakdown,
  EMPTY_EXPENSES,
  MonthlyEntry,
  OilChangeRecord,
} from '../taxiTypes';
import { formatInteger } from './taxiFormat';
import {
  settleDriverPayments,
  sumDriverPayments,
  getRentScheduleForEntry,
  getPaymentCycleForEntry,
  type DriverPaymentTriple,
  type PaymentMode,
} from './taxiDriverPayments';
import type { RentSchedule } from './taxiRentSchedule';
import type { PaymentCycleResult } from './taxiPaymentCycle';
import type { TaxiSettings } from '../taxiTypes';
import { resolvePaymentAnchor } from './taxiPaymentSettings';
import * as monthKeyUtil from './taxiMonthKey';

export const formatMonthLabel = monthKeyUtil.formatMonthLabel;
export const formatMonthNumber = monthKeyUtil.formatMonthNumber;
export const monthKey = monthKeyUtil.monthKey;

export type PaymentStatus = 'مكتمل' | 'مدفوع جزئياً' | 'غير مكتمل';

export function getRemaining(guarantee: number, driverPaid: number): number {
  return Math.max(0, guarantee - driverPaid);
}

/** شهر السجل قبل الشهر الحالي (انتهى) */
export function isEntryMonthBeforeCurrent(
  entryDate: string,
  now: Date = new Date()
): boolean {
  const mk = monthKeyUtil.monthKey(entryDate);
  if (!mk) return false;
  const [y, m] = mk.split('-').map(Number);
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  return y < cy || (y === cy && m < cm);
}

/** تسديد مكتمل: لا متبقي أو تعليم يدوي */
export function isPaymentSettled(remaining: number, paymentComplete: boolean): boolean {
  return paymentComplete || remaining <= 0;
}

export function resolvePaymentStatus(
  remaining: number,
  paymentComplete: boolean,
  totalPaid = 0,
  totalDue = 0
): PaymentStatus {
  if (paymentComplete || remaining <= 0) return 'مكتمل';
  if (totalPaid > 0 && remaining > 0) return 'مدفوع جزئياً';
  return 'غير مكتمل';
}

export function paymentStatusBadgeClass(status: PaymentStatus): string {
  if (status === 'غير مكتمل') return 'bg-red-100 text-red-700';
  if (status === 'مدفوع جزئياً') return 'bg-amber-100 text-amber-800';
  return 'bg-green-100 text-green-700';
}

export function cycleStatusToEntryStatus(
  cycle: PaymentCycleResult,
  paymentComplete: boolean
): PaymentStatus {
  if (paymentComplete || cycle.aggregateStatus === 'paid') return 'مكتمل';
  if (cycle.aggregateStatus === 'partial') return 'مدفوع جزئياً';
  return 'غير مكتمل';
}

/** @deprecated use resolvePaymentStatus */
export function getPaymentStatus(remaining: number): PaymentStatus {
  return remaining > 0 ? 'غير مكتمل' : 'مكتمل';
}

export function sumExpenses(details: ExpenseBreakdown): number {
  return (
    details.office +
    details.insurance +
    details.oil +
    details.maintenance +
    details.accident +
    details.commission +
    details.other
  );
}

/** تكلفة الزيت من تبويب المتابعة — مصدرها سجلات oilChanges وليس الحقل الشهري */
export function oilExpenseForEntry(
  entry: MonthlyEntry,
  oilChanges: OilChangeRecord[]
): number {
  const linked = oilChanges.filter((o) => o.entryId === entry.id);
  if (linked.length > 0) {
    return linked.reduce((s, o) => s + (o.cost || 0), 0);
  }

  const mk = monthKeyUtil.monthKey(entry.date);
  const monthRecords = oilChanges.filter(
    (o) => !o.entryId && monthKeyUtil.monthKey(o.changeDate) === mk
  );
  if (monthRecords.length > 0) {
    return monthRecords.reduce((s, o) => s + (o.cost || 0), 0);
  }

  return normalizeExpenseDetails(entry.expenseDetails, entry.expenses).oil;
}

/** زيت مسجّل في شهر بلا سجل متابعة شهري */
export function orphanOilExpense(
  entries: MonthlyEntry[],
  oilChanges: OilChangeRecord[]
): number {
  let total = 0;
  for (const o of oilChanges) {
    if (o.entryId) continue;
    const mk = monthKeyUtil.monthKey(o.changeDate);
    const hasEntry = entries.some((e) => monthKeyUtil.monthKey(e.date) === mk);
    if (!hasEntry) total += o.cost || 0;
  }
  return total;
}

export function entryExpenseDetails(
  entry: MonthlyEntry,
  oilChanges: OilChangeRecord[] = []
): ExpenseBreakdown {
  const base = normalizeExpenseDetails(entry.expenseDetails, entry.expenses);
  return { ...base, oil: oilExpenseForEntry(entry, oilChanges) };
}

export function normalizeExpenseDetails(
  details?: Partial<ExpenseBreakdown>,
  legacyTotal?: number
): ExpenseBreakdown {
  const normalized: ExpenseBreakdown = {
    office: details?.office ?? 0,
    insurance: details?.insurance ?? 0,
    oil: details?.oil ?? 0,
    maintenance: details?.maintenance ?? 0,
    accident: details?.accident ?? 0,
    commission: details?.commission ?? 0,
    other: details?.other ?? 0,
  };
  if (sumExpenses(normalized) === 0 && legacyTotal != null && legacyTotal > 0) {
    return { ...EMPTY_EXPENSES, other: legacyTotal };
  }
  return normalized;
}

export interface EntryComputed extends MonthlyEntry {
  guarantee: number;
  /** المطلوب من السائق (دورة ١٠ أيام في شهر السجل) */
  totalDue: number;
  driverPayments: DriverPaymentTriple;
  installmentTargets: DriverPaymentTriple;
  rentSchedule: RentSchedule;
  paymentCycle: PaymentCycleResult;
  paymentMode: PaymentMode;
  remaining: number;
  status: PaymentStatus;
  net: number;
}

export function computeEntry(
  entry: MonthlyEntry,
  defaultGuarantee: number,
  oilChanges: OilChangeRecord[] = [],
  paymentMode: PaymentMode = 'advance',
  vehicleSettings?: Pick<TaxiSettings, 'driverFirstPaymentDate' | 'paymentCycleEpoch'>
): EntryComputed {
  const paymentAnchor = vehicleSettings
    ? resolvePaymentAnchor(entry, vehicleSettings)
    : entry.paymentAnchorDate?.trim() || entry.workStartDate?.trim();
  const expenseDetails = entryExpenseDetails(entry, oilChanges);
  const expenses = sumExpenses(expenseDetails);
  const guarantee = entry.monthlyGuarantee ?? defaultGuarantee;
  const paymentComplete = Boolean(entry.paymentComplete);
  const driverPayments = settleDriverPayments(
    entry.driverPayments,
    entry.driverPaid,
    entry.date,
    entry.revenue,
    guarantee,
    paymentAnchor,
    paymentMode,
    paymentComplete
  );
  const paymentCycle = getPaymentCycleForEntry(
    entry.date,
    entry.revenue,
    guarantee,
    paymentAnchor,
    paymentMode,
    driverPayments,
    paymentComplete
  );
  const rentSchedule = getRentScheduleForEntry(
    entry.date,
    entry.revenue,
    guarantee,
    paymentAnchor,
    paymentMode,
    driverPayments,
    paymentComplete
  );
  const installmentTargets = rentSchedule.slotTargets as DriverPaymentTriple;
  const driverPaid = sumDriverPayments(driverPayments);
  const totalDue = paymentCycle.totalExpected;
  const remaining = paymentCycle.totalRemaining;
  return {
    ...entry,
    expenseDetails,
    expenses,
    driverPayments,
    driverPaid,
    paymentComplete,
    month: monthKeyUtil.formatMonthLabel(entry.date),
    guarantee,
    totalDue,
    installmentTargets,
    rentSchedule,
    paymentCycle,
    paymentMode,
    remaining,
    status: cycleStatusToEntryStatus(paymentCycle, paymentComplete),
    net: entry.revenue - expenses,
  };
}

export interface ExpenseTotalsByCategory extends ExpenseBreakdown {
  grandTotal: number;
}

export function computeExpenseTotals(
  entries: MonthlyEntry[],
  oilChanges: OilChangeRecord[] = []
): ExpenseTotalsByCategory {
  const totals: ExpenseTotalsByCategory = {
    ...EMPTY_EXPENSES,
    grandTotal: 0,
  };
  for (const e of entries) {
    const d = entryExpenseDetails(e, oilChanges);
    totals.office += d.office;
    totals.insurance += d.insurance;
    totals.oil += d.oil;
    totals.maintenance += d.maintenance;
    totals.accident += d.accident;
    totals.commission += d.commission;
    totals.other += d.other;
  }
  totals.oil += orphanOilExpense(entries, oilChanges);
  totals.grandTotal = sumExpenses(totals);
  return totals;
}

export interface DashboardTotals {
  /**
   * Passenger-reported revenue — for vehicle performance display only.
   * Do NOT use this for profitability or ROI.
   */
  totalRevenue: number;
  totalExpenses: number;
  /**
   * Owner net profit = owner income (driver payments received) - expenses.
   * F9: This replaces the old totalRevenue - totalExpenses formula.
   */
  netProfit: number;
  /** Owner income = sum of actual driver payments received. Used for profitability. */
  totalOwnerIncome: number;
  totalPaid: number;
  totalRemaining: number;
  lateCount: number;
  paidCount: number;
  expenseByCategory: ExpenseTotalsByCategory;
  /** F5: Expenses split by Normal vs Major classification */
  totalNormalExpenses: number;
  totalMajorExpenses: number;
}

export function computeDashboard(
  entries: MonthlyEntry[],
  guarantee: number,
  oilChanges: OilChangeRecord[] = [],
  paymentMode: PaymentMode = 'advance',
  vehicleSettings?: Pick<TaxiSettings, 'driverFirstPaymentDate' | 'paymentCycleEpoch'>
): DashboardTotals {
  const computed = entries.map((e) =>
    computeEntry(e, guarantee, oilChanges, paymentMode, vehicleSettings)
  );
  const expenseByCategory = computeExpenseTotals(entries, oilChanges);
  const orphanOil = orphanOilExpense(entries, oilChanges);
  const totalExpenses =
    computed.reduce((s, e) => s + e.expenses, 0) + orphanOil;
  const totalRevenue = computed.reduce((s, e) => s + e.revenue, 0);
  // F9: Owner income is actual driver payments received, not passenger revenue.
  const totalOwnerIncome = computed.reduce((s, e) => s + e.driverPaid, 0);
  // F5: Split expenses by classification
  const totalNormalExpenses = entries
    .filter((e) => !e.expenseType || e.expenseType === 'normal')
    .reduce((s, e) => {
      const c = computed.find((c) => c.id === e.id);
      return s + (c?.expenses ?? 0);
    }, 0);
  const totalMajorExpenses = entries
    .filter((e) => e.expenseType === 'major')
    .reduce((s, e) => {
      const c = computed.find((c) => c.id === e.id);
      return s + (c?.expenses ?? 0);
    }, 0);
  return {
    totalRevenue,
    totalExpenses,
    // F9: profitability uses owner income (driver payments), not passenger revenue
    netProfit: totalOwnerIncome - totalExpenses,
    totalOwnerIncome,
    totalPaid: computed.reduce((s, e) => s + e.driverPaid, 0),
    totalRemaining: computed.reduce((s, e) => s + e.remaining, 0),
    lateCount: computed.filter((e) => e.status !== 'مكتمل').length,
    paidCount: computed.filter((e) => e.status === 'مكتمل').length,
    expenseByCategory,
    totalNormalExpenses,
    totalMajorExpenses,
  };
}

export function formatDurationMonths(months: number): string {
  if (!Number.isFinite(months) || months <= 0) return '—';
  const years = Math.floor(months / 12);
  const rem = Math.round(months % 12);
  if (years === 0) return `${formatInteger(rem)} شهر`;
  if (rem === 0) return `${formatInteger(years)} سنة`;
  return `${formatInteger(years)} سنة و ${formatInteger(rem)} شهر`;
}

function addMonthsToDate(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  return monthKeyUtil.formatMonthLabel(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  );
}

export interface RoiChartPoint {
  monthIndex: number;
  label: string;
  cumulative: number;
  isProjected: boolean;
}

export interface RoiAnalysis {
  vehicleCost: number;
  lifeYears: number;
  lifeMonths: number;
  monthsRecorded: number;
  avgMonthlyNet: number;
  cumulativeActual: number;
  breakEvenMonths: number;
  breakEvenDuration: string;
  breakEvenPeriodLabel: string;
  recoversWithinLife: boolean;
  monthsRemainingToBreakEven: number;
  totalProfitOverLife: number;
  netGainAfterCost: number;
  chartData: RoiChartPoint[];
}

export function computeRoiAnalysis(
  entries: EntryComputed[],
  vehicleCost: number,
  lifeYears: number
): RoiAnalysis {
  const safeLifeYears = Math.max(1, lifeYears || 1);
  const lifeMonths = safeLifeYears * 12;
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const monthsRecorded = sorted.length;
  // F9: ROI uses owner income (driverPaid) - expenses, not passenger revenue
  const totalNet = sorted.reduce((s, e) => s + (e.driverPaid - e.expenses), 0);
  const avgMonthlyNet =
    monthsRecorded > 0 ? totalNet / monthsRecorded : 0;

  let cumulativeActual = 0;
  for (const e of sorted) cumulativeActual += e.driverPaid - e.expenses;

  const breakEvenMonths =
    avgMonthlyNet > 0 ? Math.ceil(vehicleCost / avgMonthlyNet) : Infinity;

  const startDate = sorted[0]?.date ?? new Date().toISOString().slice(0, 10);
  const breakEvenPeriodLabel =
    Number.isFinite(breakEvenMonths) && breakEvenMonths > 0
      ? addMonthsToDate(startDate, breakEvenMonths - 1)
      : '—';

  const recoversWithinLife = breakEvenMonths <= lifeMonths;
  const monthsRemainingToBreakEven = Math.max(
    0,
    Number.isFinite(breakEvenMonths) ? breakEvenMonths - monthsRecorded : 0
  );

  const totalProfitOverLife = avgMonthlyNet * lifeMonths;
  const netGainAfterCost = totalProfitOverLife - vehicleCost;

  const chartData: RoiChartPoint[] = [];
  let cumulative = 0;
  for (let i = 1; i <= lifeMonths; i++) {
    const isProjected = i > monthsRecorded;
    if (i <= monthsRecorded) {
      // F9: accumulate owner income - expenses, not passenger revenue - expenses
      cumulative += sorted[i - 1].driverPaid - sorted[i - 1].expenses;
      chartData.push({
        monthIndex: i,
        label: sorted[i - 1].month,
        cumulative,
        isProjected: false,
      });
    } else {
      cumulative += avgMonthlyNet;
      const label =
        i % 12 === 0 || i === lifeMonths
          ? `سنة ${Math.ceil(i / 12)}`
          : '';
      chartData.push({
        monthIndex: i,
        label: label || `ش${i}`,
        cumulative,
        isProjected: true,
      });
    }
  }

  return {
    vehicleCost,
    lifeYears: safeLifeYears,
    lifeMonths,
    monthsRecorded,
    avgMonthlyNet,
    cumulativeActual,
    breakEvenMonths,
    breakEvenDuration: formatDurationMonths(breakEvenMonths),
    breakEvenPeriodLabel,
    recoversWithinLife,
    monthsRemainingToBreakEven,
    totalProfitOverLife,
    netGainAfterCost,
    chartData,
  };
}
