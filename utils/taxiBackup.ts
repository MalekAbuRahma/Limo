import { TaxiAppState } from '../taxiTypes';
import { migrateAccident } from './taxiAccidents';
import { migrateLicense } from './taxiLicenses';
import { migrateOilChange } from './taxiOilChange';
import { migrateEntry, migrateSettings } from './taxiStorage';

const BACKUP_META_KEY = 'taxi_tracker_last_backup';
export const BACKUP_INTERVAL_DAYS = 7;

export interface BackupStatus {
  lastBackupAt: number | null;
  daysSinceBackup: number | null;
  daysUntilDue: number | null;
  isOverdue: boolean;
  hasBackupBefore: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(label: string) {
  return label.replace(/[^\w\-]/g, '_').slice(0, 40) || 'taxi-backup';
}

export function recordBackupCompleted(): void {
  localStorage.setItem(BACKUP_META_KEY, String(Date.now()));
}

export function getBackupStatus(intervalDays = BACKUP_INTERVAL_DAYS): BackupStatus {
  const raw = localStorage.getItem(BACKUP_META_KEY);
  const lastBackupAt = raw ? Number(raw) : null;
  const hasBackupBefore = lastBackupAt != null && Number.isFinite(lastBackupAt);

  if (!hasBackupBefore) {
    return {
      lastBackupAt: null,
      daysSinceBackup: null,
      daysUntilDue: null,
      isOverdue: true,
      hasBackupBefore: false,
    };
  }

  const msSince = Date.now() - lastBackupAt;
  const daysSinceBackup = Math.floor(msSince / (24 * 60 * 60 * 1000));
  const daysUntilDue = Math.max(0, intervalDays - daysSinceBackup);

  return {
    lastBackupAt,
    daysSinceBackup,
    daysUntilDue,
    isOverdue: daysSinceBackup >= intervalDays,
    hasBackupBefore: true,
  };
}

/** تنزيل نسخة احتياطية JSON (كل البيانات + الإعدادات) */
export function exportBackupJson(state: TaxiAppState, vehicleLabel: string): void {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${safeFilename(vehicleLabel)}_backup_${date}.json`);
  recordBackupCompleted();
}

/** استيراد نسخة احتياطية من ملف JSON */
export function parseBackupJson(raw: string): TaxiAppState {
  const parsed = JSON.parse(raw) as TaxiAppState;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ملف غير صالح');
  }
  if (!parsed.settings || !Array.isArray(parsed.entries)) {
    throw new Error('الملف لا يحتوي على إعدادات وسجلات');
  }
  return {
    settings: migrateSettings(parsed.settings),
    entries: parsed.entries
      .filter((e) => e?.id && !String(e.id).startsWith('sample-'))
      .map((e) => migrateEntry(e as Parameters<typeof migrateEntry>[0])),
    accidents: Array.isArray(parsed.accidents)
      ? parsed.accidents.filter((a) => a?.id).map((a) => migrateAccident(a))
      : [],
    licenses: Array.isArray(parsed.licenses)
      ? parsed.licenses.filter((l) => l?.id).map((l) => migrateLicense(l))
      : [],
    oilChanges: Array.isArray(parsed.oilChanges)
      ? parsed.oilChanges.filter((o) => o?.id).map((o) => migrateOilChange(o))
      : [],
  };
}
