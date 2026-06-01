import type {
  AccidentRecord,
  LicenseRecord,
  MonthlyEntry,
  OilChangeRecord,
} from '../taxiTypes';
import { computeAccidentSummary, mergeAccidentsIntoDashboard } from './taxiAccidents';
import { computeDashboard, type DashboardTotals } from './taxiCalculations';
import { computeLicenseSummary, mergeLicensesIntoDashboard } from './taxiLicenses';

/** Full vehicle totals — matches the car «الملخص» tab (entries + oil + accidents + licenses). */
export function computeFullVehicleTotals(
  entries: MonthlyEntry[],
  guarantee: number,
  accidents: AccidentRecord[] = [],
  licenses: LicenseRecord[] = [],
  oilChanges: OilChangeRecord[] = []
): DashboardTotals {
  const base = computeDashboard(entries, guarantee, oilChanges);
  const accidentSummary = computeAccidentSummary(base.netProfit, accidents, guarantee);
  const licenseSummary = computeLicenseSummary(licenses);
  const withAccidents = mergeAccidentsIntoDashboard(base, accidentSummary);
  return mergeLicensesIntoDashboard(withAccidents, licenseSummary);
}
