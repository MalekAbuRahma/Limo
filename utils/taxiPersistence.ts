import { TaxiAppState, DEFAULT_SETTINGS } from '../taxiTypes';
import { migrateAccident } from './taxiAccidents';
import { migrateLicense } from './taxiLicenses';
import { migrateEntry, migrateSettings } from './taxiStorage';
import {
  checkApiHealth,
  fetchAppStateFromApi,
  persistAppStateToApi,
  type StorageSource,
} from './taxiApi';

export type { StorageSource };
import { loadTaxiState, saveTaxiState } from './taxiStorage';

function normalizeState(raw: TaxiAppState): TaxiAppState {
  return {
    settings: migrateSettings(raw.settings ?? {}),
    entries: (raw.entries ?? [])
      .filter((e) => e?.id && !String(e.id).startsWith('sample-'))
      .map((e) => migrateEntry(e)),
    accidents: (raw.accidents ?? [])
      .filter((a) => a?.id)
      .map((a) => migrateAccident(a)),
    licenses: (raw.licenses ?? [])
      .filter((l) => l?.id)
      .map((l) => migrateLicense(l)),
  };
}

/** دمج سجلات حسب id — المصدر الثاني (محلي) يغلّب عند التعارض */
function mergeById<T extends { id: string }>(fromApi: T[], fromLocal: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of fromApi) map.set(item.id, item);
  for (const item of fromLocal) map.set(item.id, item);
  return [...map.values()];
}

/** دمج API + localStorage حتى لا تُفقد الحوادث/التراخيص عند فتح الصفحة */
function mergeApiWithLocal(local: TaxiAppState, api: TaxiAppState): TaxiAppState {
  return normalizeState({
    settings: migrateSettings({ ...api.settings, ...local.settings }),
    entries: mergeById(api.entries, local.entries),
    accidents: mergeById(api.accidents, local.accidents),
    licenses: mergeById(api.licenses, local.licenses),
  });
}

function stateNeedsApiSync(merged: TaxiAppState, api: TaxiAppState): boolean {
  if (api.entries.length === 0 && merged.entries.length > 0) return true;
  if (merged.accidents.length !== api.accidents.length) return true;
  if (merged.licenses.length !== api.licenses.length) return true;
  const apiAccidentIds = new Set(api.accidents.map((a) => a.id));
  return merged.accidents.some((a) => !apiAccidentIds.has(a.id));
}

export interface LoadResult {
  state: TaxiAppState;
  source: StorageSource;
}

export async function loadAppState(): Promise<LoadResult> {
  const local = normalizeState(loadTaxiState());
  const apiUp = await checkApiHealth();

  if (!apiUp) {
    return { state: local, source: 'local' };
  }

  const fromApi = await fetchAppStateFromApi();
  if (!fromApi) {
    return { state: local, source: 'local' };
  }

  const apiState = normalizeState(fromApi);
  const merged = mergeApiWithLocal(local, apiState);

  if (stateNeedsApiSync(merged, apiState)) {
    await persistAppStateToApi(merged);
    saveTaxiState(merged);
    return { state: merged, source: 'sql' };
  }

  saveTaxiState(merged);
  return { state: merged, source: 'sql' };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSaveAppState(
  state: TaxiAppState,
  onResult?: (source: StorageSource) => void
): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const normalized = normalizeState(state);
    const apiUp = await checkApiHealth();
    if (apiUp && (await persistAppStateToApi(normalized))) {
      saveTaxiState(normalized);
      onResult?.('sql');
    } else {
      saveTaxiState(normalized);
      onResult?.('local');
    }
  }, 350);
}

export function flushSaveAppState(state: TaxiAppState): Promise<StorageSource> {
  return new Promise((resolve) => {
    if (saveTimer) clearTimeout(saveTimer);
    const normalized = normalizeState(state);
    void (async () => {
      const apiUp = await checkApiHealth();
      if (apiUp && (await persistAppStateToApi(normalized))) {
        saveTaxiState(normalized);
        resolve('sql');
      } else {
        saveTaxiState(normalized);
        resolve('local');
      }
    })();
  });
}

export function emptyAppState(): TaxiAppState {
  return {
    settings: { ...DEFAULT_SETTINGS },
    entries: [],
    accidents: [],
    licenses: [],
    oilChanges: [],
  };
}
