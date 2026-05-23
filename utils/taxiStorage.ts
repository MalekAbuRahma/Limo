import { TaxiAppState, DEFAULT_SETTINGS, MonthlyEntry } from '../taxiTypes';
import { migrateAccident } from './taxiAccidents';
import { migrateLicense } from './taxiLicenses';
import { migrateOilChange } from './taxiOilChange';
import { formatMonthLabel, normalizeExpenseDetails, sumExpenses } from './taxiCalculations';

const STORAGE_KEY = 'taxi_tracker_data';

const VEHICLE_LABEL = 'VIP limousine CARS';

const LEGACY_VEHICLE_LABELS = new Set([
  'سيارة أجرة',
  'سيارة أجرة — بيانات تجريبية',
  'car lamozein Honda accord',
  'Honda accord',
]);

export function migrateSettings(
  settings: Partial<TaxiAppState['settings']>
): TaxiAppState['settings'] {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  if (LEGACY_VEHICLE_LABELS.has(merged.vehicleLabel)) {
    merged.vehicleLabel = VEHICLE_LABEL;
  }
  merged.insuranceReceivedTotal = merged.insuranceReceivedTotal ?? 0;
  merged.displayTheme = merged.displayTheme ?? 'default';
  merged.boldNumbers = merged.boldNumbers ?? false;
  merged.largeButtons = merged.largeButtons ?? false;
  merged.comfortableReading = merged.comfortableReading ?? false;
  merged.vehicleImage = merged.vehicleImage ?? '';
  return merged;
}

export function migrateEntry(raw: Partial<MonthlyEntry> & { id: string }): MonthlyEntry {
  const expenseDetails = normalizeExpenseDetails(
    raw.expenseDetails as MonthlyEntry['expenseDetails'],
    raw.expenses
  );
  const date = raw.date || new Date().toISOString().slice(0, 10);
  return {
    id: raw.id,
    date,
    month: formatMonthLabel(date),
    driverName: raw.driverName ?? '',
    revenue: raw.revenue ?? 0,
    expenses: sumExpenses(expenseDetails),
    expenseDetails,
    notes: raw.notes ?? '',
    driverPaid: raw.driverPaid ?? 0,
    monthlyGuarantee: raw.monthlyGuarantee ?? DEFAULT_SETTINGS.monthlyGuarantee,
  };
}

export function loadTaxiState(): TaxiAppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        settings: { ...DEFAULT_SETTINGS },
        entries: [],
        accidents: [],
        licenses: [],
        oilChanges: [],
      };
    }
    const parsed = JSON.parse(raw) as TaxiAppState;
    return {
      settings: migrateSettings(parsed.settings ?? {}),
      entries: Array.isArray(parsed.entries)
        ? parsed.entries
            .filter((e) => e?.id && !String(e.id).startsWith('sample-'))
            .map((e) => migrateEntry(e))
        : [],
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
  } catch {
    return {
      settings: { ...DEFAULT_SETTINGS },
      entries: [],
      accidents: [],
      licenses: [],
      oilChanges: [],
    };
  }
}

export function saveTaxiState(state: TaxiAppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
