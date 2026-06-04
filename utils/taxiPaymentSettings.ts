import type { MonthlyEntry, TaxiSettings } from '../taxiTypes';
import { monthKey } from './taxiMonthKey';

export type PaymentSetupPromptReason = 'first_settlement' | 'new_driver';

/** لا يمكن إضافة دفع ضمان قبل تحديد مرساة الدورة في إعدادات السيارة */
export function requiresFirstPaymentDateSetup(
  settings: Pick<TaxiSettings, 'driverFirstPaymentDate'>
): boolean {
  return !settings.driverFirstPaymentDate?.trim();
}

/** السجل محفوظ على دورة أقدم من إعدادات السيارة الحالية */
export function isEntryOnPriorPaymentCycle(
  entry: Pick<MonthlyEntry, 'paymentCycleEpoch' | 'paymentAnchorDate'>,
  settings: Pick<TaxiSettings, 'paymentCycleEpoch'>
): boolean {
  const entryEpoch = entry.paymentCycleEpoch ?? 0;
  const settingsEpoch = settings.paymentCycleEpoch ?? 0;
  if (entryEpoch >= settingsEpoch) return false;
  return Boolean(entry.paymentAnchorDate?.trim() || entryEpoch > 0);
}

/** هل التعديل يقتصر على تاريخ أول دفعة فقط (باقي الإعدادات دون تغيير) */
export function isOnlyPaymentDateSettingsPatch(
  prev: TaxiSettings,
  next: TaxiSettings
): boolean {
  if ((prev.driverFirstPaymentDate ?? '').trim() === (next.driverFirstPaymentDate ?? '').trim()) {
    return false;
  }
  return (
    (prev.currentDriverName ?? '') === (next.currentDriverName ?? '') &&
    prev.monthlyGuarantee === next.monthlyGuarantee &&
    (prev.driverPaymentMode ?? 'advance') === (next.driverPaymentMode ?? 'advance') &&
    (prev.ownerName ?? '') === (next.ownerName ?? '') &&
    (prev.vehicleLabel ?? '') === (next.vehicleLabel ?? '') &&
    prev.vehicleCost === next.vehicleCost &&
    prev.vehicleLifeYears === next.vehicleLifeYears &&
    (prev.vehicleImage ?? '') === (next.vehicleImage ?? '') &&
    prev.fontSize === next.fontSize &&
    prev.displayTheme === next.displayTheme &&
    prev.boldNumbers === next.boldNumbers &&
    prev.largeButtons === next.largeButtons &&
    prev.comfortableReading === next.comfortableReading &&
    (prev.paymentCycleEpoch ?? 0) === (next.paymentCycleEpoch ?? 0)
  );
}

export function monthStartIso(entryMonthDate: string): string {
  const mk = monthKey(entryMonthDate);
  return mk ? `${mk}-01` : entryMonthDate.slice(0, 10);
}

/** شهر السجل قبل الشهر التقويمي الحالي */
export function isHistoricalEntryMonth(entryDate: string, asOf: Date = new Date()): boolean {
  const entryMk = monthKey(entryDate);
  if (!entryMk) return false;
  const y = asOf.getFullYear();
  const m = String(asOf.getMonth() + 1).padStart(2, '0');
  const currentMk = `${y}-${m}`;
  return entryMk < currentMk;
}

/**
 * تاريخ أول دفعة في الاحتساب:
 * - شهر سابق أو دورة أقدم (epoch): لقطة السجل.
 * - شهر حالي/مستقبل على نفس epoch: إعدادات السيارة.
 */
export function resolvePaymentAnchor(
  entry: Pick<MonthlyEntry, 'date' | 'paymentAnchorDate' | 'paymentCycleEpoch' | 'workStartDate'>,
  settings: Pick<TaxiSettings, 'driverFirstPaymentDate' | 'paymentCycleEpoch'>,
  asOf: Date = new Date()
): string {
  const savedAnchor = entry.paymentAnchorDate?.trim() || entry.workStartDate?.trim();
  const historical = isHistoricalEntryMonth(entry.date, asOf);
  const priorCycle = isEntryOnPriorPaymentCycle(entry, settings);

  if (historical || priorCycle) {
    if (savedAnchor) return savedAnchor;
    return monthStartIso(entry.date);
  }

  const settingsAnchor = settings.driverFirstPaymentDate?.trim();
  if (settingsAnchor) return settingsAnchor;
  if (savedAnchor) return savedAnchor;
  return monthStartIso(entry.date);
}

/** عند حفظ سجل: الأشهر السابقة تبقى مجمّدة؛ إعادة الحفظ تربط السجل بدورة الإعدادات الحالية */
export function snapshotPaymentAnchorOnSave(
  entry: MonthlyEntry,
  settings: TaxiSettings,
  asOf: Date = new Date()
): Pick<MonthlyEntry, 'paymentAnchorDate' | 'paymentCycleEpoch'> {
  const historical = isHistoricalEntryMonth(entry.date, asOf);
  const epoch = settings.paymentCycleEpoch ?? 0;

  if (historical && entry.paymentAnchorDate?.trim()) {
    return {
      paymentAnchorDate: entry.paymentAnchorDate.trim(),
      paymentCycleEpoch: entry.paymentCycleEpoch ?? epoch,
    };
  }

  const settingsAnchor = settings.driverFirstPaymentDate?.trim();
  if (settingsAnchor) {
    return { paymentAnchorDate: settingsAnchor, paymentCycleEpoch: epoch };
  }

  const anchor = resolvePaymentAnchor(entry, settings, asOf);
  return { paymentAnchorDate: anchor, paymentCycleEpoch: epoch };
}

/** إعادة احتساب المواعيد المستقبلية عند تغيير تاريخ أول دفعة أو السائق */
export function applyPaymentCycleSettingsPatch(
  prev: TaxiSettings,
  next: TaxiSettings
): TaxiSettings {
  const epoch = prev.paymentCycleEpoch ?? 0;
  const driverChanged =
    (prev.currentDriverName?.trim() ?? '') !== (next.currentDriverName?.trim() ?? '');
  const anchorChanged =
    (prev.driverFirstPaymentDate?.trim() ?? '') !== (next.driverFirstPaymentDate?.trim() ?? '');

  if (driverChanged) {
    return {
      ...next,
      paymentCycleEpoch: epoch + 1,
      driverFirstPaymentDate: undefined,
    };
  }
  if (anchorChanged) {
    return { ...next, paymentCycleEpoch: epoch + 1 };
  }
  return next;
}

export function migratePaymentSettings(settings: Partial<TaxiSettings>): Partial<TaxiSettings> {
  return {
    ...settings,
    paymentCycleEpoch: settings.paymentCycleEpoch ?? 0,
    driverFirstPaymentDate: settings.driverFirstPaymentDate?.trim() || undefined,
    driverPaymentMode: settings.driverPaymentMode ?? 'advance',
  };
}
