import type {
  LicenseRecord,
  MonthlyEntry,
  OilChangeRecord,
  VehicleCardProperty,
  VehicleCardPropertyTone,
} from '../taxiTypes';
import {
  computeEntry,
  formatMonthLabel,
  monthKey,
  type PaymentStatus,
} from './taxiCalculations';
import {
  formatRenewalLabel,
  getLicenseRenewalInfo,
  type LicenseRenewalStatus,
} from './taxiLicenses';
import { formatNumber } from './taxiFormat';

const fmt = formatNumber;

function currentMonthDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function settlementTone(
  status: PaymentStatus | 'none',
  remaining: number
): VehicleCardPropertyTone {
  if (status === 'none') return 'neutral';
  if (status === 'مكتمل' || remaining <= 0) return 'ok';
  return 'danger';
}

function licenseTone(status: LicenseRenewalStatus): VehicleCardPropertyTone {
  if (status === 'ok') return 'ok';
  if (status === 'soon') return 'warn';
  return 'danger';
}

function formatDueDate(dueDate: string): string {
  return formatMonthLabel(dueDate) || dueDate;
}

/** بطاقة المرآب: تسوية الشهر الحالي + موعد ترخيص السيارة */
export function computeVehicleCardProperties(
  entries: MonthlyEntry[],
  monthlyGuarantee: number,
  licenses: LicenseRecord[],
  oilChanges: OilChangeRecord[] = [],
  now: Date = new Date()
): VehicleCardProperty[] {
  const monthDate = currentMonthDate(now);
  const mk = monthKey(monthDate);
  const monthLabel = formatMonthLabel(monthDate);

  const currentEntry = entries.find((e) => monthKey(e.date) === mk);
  let settlement: VehicleCardProperty;

  if (currentEntry) {
    const computed = computeEntry(currentEntry, monthlyGuarantee, oilChanges);
    const status = computed.status;
    const value =
      computed.remaining > 0
        ? `متبقي ${fmt(computed.remaining)} د.أ — ${status}`
        : `مكتمل — ${status}`;
    settlement = {
      id: 'current-settlement',
      label: `تسوية ${monthLabel}`,
      value,
      hint: `مدفوع ${fmt(computed.driverPaid)} / ${fmt(computed.totalDue)} د.أ`,
      tone: settlementTone(status, computed.remaining),
    };
  } else {
    settlement = {
      id: 'current-settlement',
      label: `تسوية ${monthLabel}`,
      value: 'لا يوجد سجل بعد',
      hint: `المتوقع ~${fmt(monthlyGuarantee)} د.أ — أضف الشهر من المتابعة`,
      tone: 'neutral',
    };
  }

  let licenseProp: VehicleCardProperty;
  if (licenses.length === 0) {
    licenseProp = {
      id: 'license-renewal',
      label: 'ترخيص السيارة',
      value: 'لا يوجد سجل ترخيص',
      hint: 'سجّل من تبويب الترخيص السنوي',
      tone: 'neutral',
    };
  } else {
    const latest = [...licenses].sort((a, b) =>
      b.licenseDate.localeCompare(a.licenseDate)
    )[0];
    const info = getLicenseRenewalInfo(latest.licenseDate, now);
    licenseProp = {
      id: 'license-renewal',
      label: 'ترخيص السيارة',
      value: formatRenewalLabel(info),
      hint: `موعد التجديد ${formatDueDate(info.dueDate)}`,
      tone: licenseTone(info.status),
    };
  }

  return [settlement, licenseProp];
}
