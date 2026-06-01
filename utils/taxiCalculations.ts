import {
  ExpenseBreakdown,
  EMPTY_EXPENSES,
  MonthlyEntry,
  OilChangeRecord,
} from '../taxiTypes';
import { formatInteger } from './taxiFormat';
import {
  normalizeDriverPayments,
  sumDriverPayments,
  splitRevenueToInstallments,
  entryTotalDue,
  type DriverPaymentTriple,
} from './taxiDriverPayments';

export type PaymentStatus = 'مكتمل' | 'غير مكتمل';

export function getRemaining(guarantee: number, driverPaid: number): number {
  return Math.max(0, guarantee - driverPaid);
}

/** شهر السجل قبل الشهر الحالي (انتهى) */
export function isEntryMonthBeforeCurrent(
  entryDate: string,
  now: Date = new Date()
): boolean {
  const mk = monthKey(entryDate);
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
  paymentComplete: boolean
): PaymentStatus {
  return isPaymentSettled(remaining, paymentComplete) ? 'مكتمل' : 'غير مكتمل';
}

export function paymentStatusBadgeClass(status: PaymentStatus): string {
  if (status === 'غير مكتمل') return 'bg-red-100 text-red-700';
  return 'bg-green-100 text-green-700';
}

/** @deprecated use resolvePaymentStatus */
export function getPaymentStatus(remaining: number): PaymentStatus {
  return remaining > 0 ? 'غير مكتمل' : 'مكتمل';
}

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

  const mk = monthKey(entry.date);
  const monthRecords = oilChanges.filter(
    (o) => !o.entryId && monthKey(o.changeDate) === mk
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
    const mk = monthKey(o.changeDate);
    const hasEntry = entries.some((e) => monthKey(e.date) === mk);
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
  /** المطلوب من السائق (الإيراد أو الضمان) */
  totalDue: number;
  driverPayments: DriverPaymentTriple;
  installmentTargets: DriverPaymentTriple;
  remaining: number;
  status: PaymentStatus;
  net: number;
}

export function computeEntry(
  entry: MonthlyEntry,
  defaultGuarantee: number,
  oilChanges: OilChangeRecord[] = []
): EntryComputed {
  const expenseDetails = entryExpenseDetails(entry, oilChanges);
  const expenses = sumExpenses(expenseDetails);
  const guarantee = entry.monthlyGuarantee ?? defaultGuarantee;
  const installmentTargets = splitRevenueToInstallments(entry.revenue);
  const driverPayments = normalizeDriverPayments(
    entry.driverPayments,
    entry.driverPaid,
    entry.revenue
  );
  const driverPaid = sumDriverPayments(driverPayments);
  const totalDue = entryTotalDue(entry.revenue, guarantee);
  const remaining = getRemaining(totalDue, driverPaid);
  const paymentComplete = Boolean(entry.paymentComplete);
  return {
    ...entry,
    expenseDetails,
    expenses,
    driverPayments,
    driverPaid,
    paymentComplete,
    month: formatMonthLabel(entry.date),
    guarantee,
    totalDue,
    installmentTargets,
    remaining,
    status: resolvePaymentStatus(remaining, paymentComplete),
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
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalPaid: number;
  totalRemaining: number;
  lateCount: number;
  paidCount: number;
  expenseByCategory: ExpenseTotalsByCategory;
}

export function computeDashboard(
  entries: MonthlyEntry[],
  guarantee: number,
  oilChanges: OilChangeRecord[] = []
): DashboardTotals {
  const computed = entries.map((e) => computeEntry(e, guarantee, oilChanges));
  const expenseByCategory = computeExpenseTotals(entries, oilChanges);
  const orphanOil = orphanOilExpense(entries, oilChanges);
  const totalExpenses =
    computed.reduce((s, e) => s + e.expenses, 0) + orphanOil;
  const totalRevenue = computed.reduce((s, e) => s + e.revenue, 0);
  return {
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    totalPaid: computed.reduce((s, e) => s + e.driverPaid, 0),
    totalRemaining: computed.reduce((s, e) => s + e.remaining, 0),
    lateCount: computed.filter((e) => e.status === 'غير مكتمل').length,
    paidCount: computed.filter((e) => e.status === 'مكتمل').length,
    expenseByCategory,
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
  return formatMonthLabel(
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
  const totalNet = sorted.reduce((s, e) => s + e.net, 0);
  const avgMonthlyNet =
    monthsRecorded > 0 ? totalNet / monthsRecorded : 0;

  let cumulativeActual = 0;
  for (const e of sorted) cumulativeActual += e.net;

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
      cumulative += sorted[i - 1].net;
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
