import { LicenseRecord } from '../taxiTypes';
import type { DashboardTotals } from './taxiCalculations';

export type LicenseRenewalStatus = 'ok' | 'soon' | 'due' | 'overdue';

export interface LicenseRenewalInfo {
  status: LicenseRenewalStatus;
  dueDate: string;
  daysUntil: number;
}

export function migrateLicense(raw: Partial<LicenseRecord> & { id: string }): LicenseRecord {
  const year =
    typeof raw.licenseYear === 'number'
      ? raw.licenseYear
      : parseInt(String(raw.licenseYear ?? new Date().getFullYear()), 10);
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  let licenseDate = raw.licenseDate ?? '';
  if (!licenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(licenseDate)) {
    licenseDate = `${safeYear}-01-01`;
  }
  const licenseYear = parseInt(licenseDate.slice(0, 4), 10) || safeYear;
  return {
    id: raw.id,
    licenseDate,
    licenseYear,
    amountPaid: raw.amountPaid ?? 0,
    notes: raw.notes ?? '',
  };
}

export interface LicenseSummary {
  count: number;
  totalPaid: number;
  renewalAlerts: LicenseRenewalAlert[];
}

export interface LicenseRenewalAlert {
  record: LicenseRecord;
  info: LicenseRenewalInfo;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SOON_DAYS = 30;

export function getLicenseRenewalDueDate(licenseDate: string): string {
  const d = new Date(licenseDate + 'T12:00:00');
  if (isNaN(d.getTime())) return licenseDate;
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function getLicenseRenewalInfo(
  licenseDate: string,
  today: Date = new Date()
): LicenseRenewalInfo {
  const dueDate = getLicenseRenewalDueDate(licenseDate);
  const due = new Date(dueDate + 'T12:00:00');
  const now = new Date(today.toISOString().slice(0, 10) + 'T12:00:00');
  const daysUntil = Math.round((due.getTime() - now.getTime()) / MS_PER_DAY);

  if (daysUntil < 0) {
    return { status: 'overdue', dueDate, daysUntil };
  }
  if (daysUntil === 0) {
    return { status: 'due', dueDate, daysUntil: 0 };
  }
  if (daysUntil <= SOON_DAYS) {
    return { status: 'soon', dueDate, daysUntil };
  }
  return { status: 'ok', dueDate, daysUntil };
}

export function formatRenewalLabel(info: LicenseRenewalInfo): string {
  if (info.status === 'overdue') {
    return `متأخر ${Math.abs(info.daysUntil)} يوم — التجديد ${info.dueDate}`;
  }
  if (info.status === 'due') {
    return `اليوم موعد التجديد`;
  }
  if (info.status === 'soon') {
    return `التجديد خلال ${info.daysUntil} يوم (${info.dueDate})`;
  }
  return `التجديد ${info.dueDate}`;
}

export function getLicenseRenewalAlerts(licenses: LicenseRecord[]): LicenseRenewalAlert[] {
  return licenses
    .map((record) => ({
      record,
      info: getLicenseRenewalInfo(record.licenseDate),
    }))
    .filter((a) => a.info.status !== 'ok')
    .sort((a, b) => a.info.daysUntil - b.info.daysUntil);
}

export function computeLicenseSummary(licenses: LicenseRecord[]): LicenseSummary {
  const totalPaid = licenses.reduce((s, l) => s + (l.amountPaid ?? 0), 0);
  return {
    count: licenses.length,
    totalPaid,
    renewalAlerts: getLicenseRenewalAlerts(licenses),
  };
}

export function mergeLicensesIntoDashboard(
  totals: DashboardTotals,
  summary: LicenseSummary
): DashboardTotals {
  const extra = summary.totalPaid;
  if (extra <= 0) return totals;
  return {
    ...totals,
    totalExpenses: totals.totalExpenses + extra,
    netProfit: totals.netProfit - extra,
  };
}
