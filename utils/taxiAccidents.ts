import { AccidentRecord } from '../taxiTypes';
import type { DashboardTotals } from './taxiCalculations';

/** أيام الشهر لحساب تعويض التعطل اليومي من الضمان الشهري */
export const DOWNTIME_DAYS_PER_MONTH = 30;

export function getDowntimeDailyRate(monthlyGuarantee: number): number {
  const g = monthlyGuarantee > 0 ? monthlyGuarantee : 750;
  return Math.round(g / DOWNTIME_DAYS_PER_MONTH);
}

export function getDowntimeAmount(days: number, dailyRate: number): number {
  return Math.max(0, Math.floor(days)) * dailyRate;
}

export function getInsuranceClaimTotal(
  accident: AccidentRecord,
  dailyRate: number
): number {
  return getDowntimeAmount(accident.downtimeDays ?? 0, dailyRate) + (accident.cost ?? 0);
}

export function formatArabicDaysCount(days: number): string {
  const d = Math.max(0, Math.floor(days));
  if (d === 0) return '';
  if (d === 1) return 'يوم واحد';
  if (d === 2) return 'يومان';
  if (d >= 3 && d <= 10) return `${d} أيام`;
  return `${d} يوم`;
}

export interface ClaimBreakdown {
  downtimeDays: number;
  downtimeAmount: number;
  repairCost: number;
  totalClaim: number;
  downtimeLine: string;
}

export function computeClaimBreakdown(
  accident: AccidentRecord,
  dailyRate: number
): ClaimBreakdown {
  const downtimeDays = accident.downtimeDays ?? 0;
  const downtimeAmount = getDowntimeAmount(downtimeDays, dailyRate);
  const repairCost = accident.cost ?? 0;
  const totalClaim = downtimeAmount + repairCost;
  const label = formatArabicDaysCount(downtimeDays);
  const downtimeLine =
    downtimeDays > 0 ? `${label} · ${downtimeAmount}` : '';

  return {
    downtimeDays,
    downtimeAmount,
    repairCost,
    totalClaim,
    downtimeLine,
  };
}

/** لم يُعبَّأ مستلم من التأمين (صفر أو فارغ) */
export function isAwaitingInsurance(accident: AccidentRecord): boolean {
  const v = accident.insuranceReceived;
  return v == null || Number(v) <= 0;
}

export function migrateAccident(raw: Partial<AccidentRecord> & { id: string }): AccidentRecord {
  return {
    id: raw.id,
    accidentDate: raw.accidentDate || new Date().toISOString().slice(0, 10),
    responsibleDriver: raw.responsibleDriver ?? '',
    downtimeDays: raw.downtimeDays ?? 0,
    details: raw.details ?? '',
    cost: raw.cost ?? 0,
    insurancePending: raw.insurancePending ?? 0,
    insuranceReceived: raw.insuranceReceived ?? 0,
  };
}

export interface AccidentSummary {
  count: number;
  totalCost: number;
  totalDowntimeDays: number;
  /** عدد الحوادث بلا مستلم من التأمين */
  totalPending: number;
  /** مجموع مطالبة التأمين (تعطل + إصلاح) */
  totalClaimAmount: number;
  downtimeDailyRate: number;
  totalReceivedFromAccidents: number;
  /** مجموع مستلم من التأمين (من سجلات الحوادث فقط) */
  totalInsuranceReceived: number;
  /** صافي الشهور − تكاليف الحوادث + مستلم من التأمين */
  adjustedNetProfit: number;
}

/** دمج تكاليف الإصلاح في المصاريف والتعويض في صافي الربح */
export function mergeAccidentsIntoDashboard(
  baseTotals: DashboardTotals,
  summary: AccidentSummary
): DashboardTotals {
  return {
    ...baseTotals,
    totalExpenses: baseTotals.totalExpenses + summary.totalCost,
    netProfit:
      baseTotals.netProfit -
      summary.totalCost +
      summary.totalInsuranceReceived,
  };
}

export function computeAccidentSummary(
  monthlyNetProfit: number,
  accidents: AccidentRecord[],
  monthlyGuarantee = 750
): AccidentSummary {
  const downtimeDailyRate = getDowntimeDailyRate(monthlyGuarantee);
  const totalCost = accidents.reduce((s, a) => s + (a.cost ?? 0), 0);
  const totalDowntimeDays = accidents.reduce((s, a) => s + (a.downtimeDays ?? 0), 0);
  const totalPending = accidents.filter(isAwaitingInsurance).length;
  const totalClaimAmount = accidents.reduce(
    (s, a) => s + getInsuranceClaimTotal(a, downtimeDailyRate),
    0
  );
  const totalReceivedFromAccidents = accidents.reduce(
    (s, a) => s + (a.insuranceReceived ?? 0),
    0
  );
  const totalInsuranceReceived = totalReceivedFromAccidents;

  return {
    count: accidents.length,
    totalCost,
    totalDowntimeDays,
    totalPending,
    totalClaimAmount,
    downtimeDailyRate,
    totalReceivedFromAccidents,
    totalInsuranceReceived,
    adjustedNetProfit:
      monthlyNetProfit - totalCost + totalInsuranceReceived,
  };
}
