import {
  DEFAULT_SETTINGS,
  FleetData,
  FleetGlobalSettings,
  TaxiAppState,
  VehicleCreateInput,
  VehicleListItem,
} from '../taxiTypes';
import { migrateAccident } from './taxiAccidents';
import { migrateLicense } from './taxiLicenses';
import { migrateOilChange } from './taxiOilChange';
import { migrateEntry, migrateSettings } from './taxiStorage';
import { computeFullVehicleTotals } from './taxiVehicleTotals';
import { computeVehicleCardProperties } from './vehicleGarageCard';
import { hasVehicleImage, VEHICLE_IMAGE_REQUIRED_MSG } from './vehicleImage';
import {
  checkApiHealth,
  createVehicleOnApi,
  deleteVehicleOnApi,
  fetchFleetFromApi,
  fetchVehicleStateFromApi,
  persistVehicleStateToApi,
  type StorageSource,
} from './taxiApi';

export type { StorageSource };

const FLEET_INDEX_KEY = 'taxi_fleet_index';
const vehicleStorageKey = (id: string) => `taxi_vehicle_${id}`;

export interface FleetIndex {
  globalSettings: FleetGlobalSettings;
  vehicles: Pick<VehicleListItem, 'id' | 'label' | 'vehicleImage'>[];
}

function defaultGlobalSettings(): FleetGlobalSettings {
  return {
    fontSize: DEFAULT_SETTINGS.fontSize,
    displayTheme: DEFAULT_SETTINGS.displayTheme,
    boldNumbers: DEFAULT_SETTINGS.boldNumbers,
    largeButtons: DEFAULT_SETTINGS.largeButtons,
    comfortableReading: DEFAULT_SETTINGS.comfortableReading,
  };
}

function normalizeVehicleState(raw: TaxiAppState): TaxiAppState {
  return {
    settings: migrateSettings(raw.settings ?? {}),
    entries: (raw.entries ?? [])
      .filter((e) => e?.id && !String(e.id).startsWith('sample-'))
      .map((e) => migrateEntry(e)),
    accidents: (raw.accidents ?? []).filter((a) => a?.id).map((a) => migrateAccident(a)),
    licenses: (raw.licenses ?? []).filter((l) => l?.id).map((l) => migrateLicense(l)),
    oilChanges: (raw.oilChanges ?? []).filter((o) => o?.id).map((o) => migrateOilChange(o)),
  };
}

function loadFleetIndex(): FleetIndex {
  try {
    const raw = localStorage.getItem(FLEET_INDEX_KEY);
    if (!raw) {
      return { globalSettings: defaultGlobalSettings(), vehicles: [] };
    }
    const parsed = JSON.parse(raw) as FleetIndex;
    return {
      globalSettings: { ...defaultGlobalSettings(), ...parsed.globalSettings },
      vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
    };
  } catch {
    return { globalSettings: defaultGlobalSettings(), vehicles: [] };
  }
}

function saveFleetIndex(index: FleetIndex): void {
  localStorage.setItem(FLEET_INDEX_KEY, JSON.stringify(index));
}

function loadVehicleLocal(vehicleId: string): TaxiAppState | null {
  try {
    const raw = localStorage.getItem(vehicleStorageKey(vehicleId));
    if (!raw) return null;
    return normalizeVehicleState(JSON.parse(raw) as TaxiAppState);
  } catch {
    return null;
  }
}

function saveVehicleLocal(vehicleId: string, state: TaxiAppState): void {
  localStorage.setItem(vehicleStorageKey(vehicleId), JSON.stringify(normalizeVehicleState(state)));
}

function migrateLegacySingleCar(index: FleetIndex): FleetIndex {
  const legacyKey = 'taxi_tracker_data';
  const raw = localStorage.getItem(legacyKey);
  if (!raw || index.vehicles.length > 0) return index;

  const state = normalizeVehicleState(JSON.parse(raw) as TaxiAppState);
  const id = 'vehicle-default';
  saveVehicleLocal(id, state);
  const next: FleetIndex = {
    globalSettings: {
      fontSize: state.settings.fontSize,
      displayTheme: state.settings.displayTheme,
      boldNumbers: state.settings.boldNumbers,
      largeButtons: state.settings.largeButtons,
      comfortableReading: state.settings.comfortableReading,
    },
    vehicles: [
      {
        id,
        label: state.settings.vehicleLabel || 'VIP limousine CARS',
        vehicleImage: state.settings.vehicleImage || '',
      },
    ],
  };
  saveFleetIndex(next);
  return next;
}

export async function loadFleet(): Promise<{ fleet: FleetData; source: StorageSource }> {
  let index = migrateLegacySingleCar(loadFleetIndex());
  const apiUp = await checkApiHealth();

  if (apiUp) {
    const fromApi = await fetchFleetFromApi();
    if (fromApi?.vehicles) {
      saveFleetIndex({
        globalSettings: fromApi.globalSettings,
        vehicles: fromApi.vehicles.map((v) => ({
          id: v.id,
          label: v.label,
          vehicleImage: v.vehicleImage,
        })),
      });
      return { fleet: fromApi, source: 'sql' };
    }
  }

  const vehicles: VehicleListItem[] = index.vehicles.map((v) => {
    const state = loadVehicleLocal(v.id);
    const entries = state?.entries ?? [];
    const accidents = state?.accidents ?? [];
    const licenses = state?.licenses ?? [];
    const oilChanges = state?.oilChanges ?? [];
    const guarantee = state?.settings.monthlyGuarantee ?? 750;
    const totals = computeFullVehicleTotals(
      entries,
      guarantee,
      accidents,
      licenses,
      oilChanges
    );

    return {
      id: v.id,
      label: v.label,
      vehicleImage: v.vehicleImage,
      ownerName: state?.settings.ownerName ?? '',
      monthlyGuarantee: guarantee,
      currentDriverName: state?.settings.currentDriverName ?? '',
      vehicleCost: state?.settings.vehicleCost ?? 0,
      vehicleLifeYears: state?.settings.vehicleLifeYears ?? 7,
      entryCount: entries.length,
      totalRevenue: totals.totalRevenue,
      totalExpenses: totals.totalExpenses,
      netProfit: totals.netProfit,
      cardProperties: computeVehicleCardProperties(
        entries,
        guarantee,
        licenses,
        oilChanges
      ),
    };
  });

  return {
    fleet: { globalSettings: index.globalSettings, vehicles },
    source: 'local',
  };
}

export async function loadVehicleState(
  vehicleId: string
): Promise<{ state: TaxiAppState; source: StorageSource }> {
  const local = loadVehicleLocal(vehicleId);
  const apiUp = await checkApiHealth();

  if (apiUp) {
    const fromApi = await fetchVehicleStateFromApi(vehicleId);
    if (fromApi) {
      const normalized = normalizeVehicleState(fromApi);
      saveVehicleLocal(vehicleId, normalized);
      return { state: normalized, source: 'sql' };
    }
  }

  if (local) return { state: local, source: 'local' };

  return {
    state: {
      settings: { ...DEFAULT_SETTINGS, vehicleLabel: 'سيارة جديدة' },
      entries: [],
      accidents: [],
      licenses: [],
      oilChanges: [],
    },
    source: 'local',
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSaveVehicleState(
  vehicleId: string,
  state: TaxiAppState,
  onResult?: (source: StorageSource) => void
): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const normalized = normalizeVehicleState(state);
    if (!hasVehicleImage(normalized.settings.vehicleImage)) return;
    const apiUp = await checkApiHealth();
    if (apiUp && (await persistVehicleStateToApi(vehicleId, normalized))) {
      saveVehicleLocal(vehicleId, normalized);
      onResult?.('sql');
    } else {
      saveVehicleLocal(vehicleId, normalized);
      onResult?.('local');
    }
  }, 350);
}

export async function flushSaveVehicleState(
  vehicleId: string,
  state: TaxiAppState
): Promise<StorageSource> {
  if (saveTimer) clearTimeout(saveTimer);
  const normalized = normalizeVehicleState(state);
  if (!hasVehicleImage(normalized.settings.vehicleImage)) {
    throw new Error(VEHICLE_IMAGE_REQUIRED_MSG);
  }
  const apiUp = await checkApiHealth();
  if (apiUp && (await persistVehicleStateToApi(vehicleId, normalized))) {
    saveVehicleLocal(vehicleId, normalized);
    return 'sql';
  }
  saveVehicleLocal(vehicleId, normalized);
  return 'local';
}

function buildInitialVehicleSettings(input: VehicleCreateInput) {
  const { label, vehicleImage = '' } = input;
  return {
    ...DEFAULT_SETTINGS,
    vehicleLabel: label,
    vehicleImage,
    monthlyGuarantee: input.monthlyGuarantee ?? DEFAULT_SETTINGS.monthlyGuarantee,
    currentDriverName: input.currentDriverName ?? '',
    ownerName: input.ownerName ?? '',
    vehicleCost: input.vehicleCost ?? DEFAULT_SETTINGS.vehicleCost,
    vehicleLifeYears: input.vehicleLifeYears ?? DEFAULT_SETTINGS.vehicleLifeYears,
  };
}

export async function createVehicle(input: VehicleCreateInput): Promise<string> {
  const { label, vehicleImage = '' } = input;
  if (!hasVehicleImage(vehicleImage)) {
    throw new Error(VEHICLE_IMAGE_REQUIRED_MSG);
  }
  const initialSettings = buildInitialVehicleSettings(input);
  const empty: TaxiAppState = {
    settings: initialSettings,
    entries: [],
    accidents: [],
    licenses: [],
    oilChanges: [],
  };

  const apiUp = await checkApiHealth();
  if (apiUp) {
    const id = await createVehicleOnApi({
      label,
      vehicleImage,
      ownerName: initialSettings.ownerName,
      monthlyGuarantee: initialSettings.monthlyGuarantee,
      currentDriverName: initialSettings.currentDriverName,
      vehicleCost: initialSettings.vehicleCost,
      vehicleLifeYears: initialSettings.vehicleLifeYears,
    });
    if (id) {
      saveVehicleLocal(id, empty);
      const index = loadFleetIndex();
      index.vehicles.push({ id, label, vehicleImage });
      saveFleetIndex(index);
      return id;
    }
  }

  const id = `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  saveVehicleLocal(id, empty);
  const index = loadFleetIndex();
  index.vehicles.push({ id, label, vehicleImage });
  saveFleetIndex(index);
  return id;
}

export async function removeVehicle(vehicleId: string): Promise<boolean> {
  const apiUp = await checkApiHealth();
  if (apiUp) {
    const ok = await deleteVehicleOnApi(vehicleId);
    if (!ok) return false;
  }
  localStorage.removeItem(vehicleStorageKey(vehicleId));
  const index = loadFleetIndex();
  index.vehicles = index.vehicles.filter((v) => v.id !== vehicleId);
  saveFleetIndex(index);
  return true;
}

export function updateFleetIndexVehicleMeta(
  vehicleId: string,
  label: string,
  vehicleImage: string
): void {
  const index = loadFleetIndex();
  const v = index.vehicles.find((x) => x.id === vehicleId);
  if (v) {
    v.label = label;
    v.vehicleImage = vehicleImage;
    saveFleetIndex(index);
  }
}

export function saveFleetGlobalSettings(global: FleetGlobalSettings): void {
  const index = loadFleetIndex();
  index.globalSettings = global;
  saveFleetIndex(index);
}

export function getFleetGlobalFromIndex(): FleetGlobalSettings {
  return loadFleetIndex().globalSettings;
}
