import type { OilChangeRecord } from '../taxiTypes';

/** حد المسافة — أكثر من هذا يُراقَب */
export const OIL_KM_ALERT_THRESHOLD = 10_000;

/** حد الزمن — أقل من شهرين (60 يوماً) */
export const OIL_DAYS_ALERT_THRESHOLD = 60;

/** المسافة المقترحة حتى تغيير الزيت القادم */
export const OIL_SERVICE_INTERVAL_KM = 10_000;

/** المسافة الافتراضية في نموذج تسجيل العداد (قابلة للتعديل) */
export const OIL_DEFAULT_DISTANCE_KM = 7_000;

export const OIL_TYPE_OPTIONS = [
  'تخليقي كامل',
  'نصف تخليقي',
  'معدني',
  'ديزل',
  'أخرى',
] as const;

export const OIL_GRADE_OPTIONS = [
  '0W-20',
  '5W-30',
  '5W-40',
  '10W-30',
  '10W-40',
  '15W-40',
  '20W-50',
  'أخرى',
] as const;

export function migrateOilChange(raw: Partial<OilChangeRecord> & { id: string }): OilChangeRecord {
  return {
    id: raw.id,
    entryId: raw.entryId ?? '',
    changeDate: raw.changeDate || new Date().toISOString().slice(0, 10),
    cost: raw.cost ?? 0,
    oilType: raw.oilType?.trim() || '',
    oilGrade: raw.oilGrade?.trim() || '',
    currentOdometer: Math.max(0, Math.round(raw.currentOdometer ?? 0)),
    distanceKm: Math.max(0, Math.round(raw.distanceKm ?? 0)),
    nextOdometer: Math.max(0, Math.round(raw.nextOdometer ?? 0)),
    notes: raw.notes ?? '',
    driverName: raw.driverName?.trim() || '',
  };
}

function parseDateMs(dateStr: string): number {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function daysBetweenDates(from: string, to: string): number {
  const diff = parseDateMs(to) - parseDateMs(from);
  if (diff <= 0) return 0;
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

export function sortOilChangesNewestFirst(records: OilChangeRecord[]): OilChangeRecord[] {
  return [...records].sort(
    (a, b) => parseDateMs(b.changeDate) - parseDateMs(a.changeDate)
  );
}

export interface OilChangeAlert {
  recordId: string;
  changeDate: string;
  distanceKm: number;
  daysSincePrevious: number;
  message: string;
}

/** تحذير: أكثر من 10,000 كم في أقل من شهرين بين تغييرين */
export function getOilChangeAlert(
  records: OilChangeRecord[],
  targetId?: string
): OilChangeAlert | null {
  const sorted = sortOilChangesNewestFirst(records);
  if (sorted.length < 2) return null;

  const latest = targetId ? sorted.find((r) => r.id === targetId) : sorted[0];
  if (!latest) return null;

  const idx = sorted.findIndex((r) => r.id === latest.id);
  const previous = sorted[idx + 1];
  if (!previous) return null;

  const days = daysBetweenDates(previous.changeDate, latest.changeDate);
  if (
    latest.distanceKm > OIL_KM_ALERT_THRESHOLD &&
    days > 0 &&
    days < OIL_DAYS_ALERT_THRESHOLD
  ) {
    return {
      recordId: latest.id,
      changeDate: latest.changeDate,
      distanceKm: latest.distanceKm,
      daysSincePrevious: days,
      message: `تنبيه: المسافة المقطوعة ${latest.distanceKm.toLocaleString('ar-JO')} كم خلال ${days} يوماً فقط — أقل من شهرين وبأكثر من ${OIL_KM_ALERT_THRESHOLD.toLocaleString('ar-JO')} كم.`,
    };
  }
  return null;
}

export function suggestNextOdometer(currentOdometer: number): number {
  if (currentOdometer <= 0) return 0;
  return currentOdometer + OIL_SERVICE_INTERVAL_KM;
}

/** العداد القادم = العداد الحالي + المسافة المقطوعة */
export function computeNextOdometer(currentOdometer: number, distanceKm: number): number {
  const cur = Math.round(currentOdometer);
  const dist = Math.round(distanceKm);
  if (cur <= 0 || dist <= 0) return 0;
  return cur + dist;
}

export function formatNextOdometerFromFields(
  currentOdometer: string,
  distanceKm: string
): string {
  const next = computeNextOdometer(Number(currentOdometer) || 0, Number(distanceKm) || 0);
  return next > 0 ? String(next) : '';
}

export function getLatestOilChange(records: OilChangeRecord[]): OilChangeRecord | null {
  const sorted = sortOilChangesNewestFirst(records);
  return sorted[0] ?? null;
}

/** مجموع حقل التكلفة لكل سجلات الزيت — يُستخدم في الملخص */
export function sumOilChangeCosts(records: OilChangeRecord[]): number {
  return records.reduce((s, o) => s + Math.max(0, Math.round(o.cost ?? 0)), 0);
}
