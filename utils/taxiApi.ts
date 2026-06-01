import { FleetData, TaxiAppState } from '../taxiTypes';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type StorageSource = 'sql' | 'local';

export function getAuthHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('taxi_tracker_session');
    if (!raw) return {};
    const session = JSON.parse(raw) as { token?: string };
    if (session?.token) {
      return { Authorization: `Bearer ${session.token}` };
    }
  } catch {
    /* ignore */
  }
  return {};
}

function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...getAuthHeaders(), ...extra };
}

const HEALTH_TTL_MS = 30_000;
let healthCache: { ok: boolean; at: number } | null = null;

export function invalidateApiHealthCache(): void {
  healthCache = null;
}

export type ApiHealthInfo = {
  ok: boolean;
  authRoutes: boolean;
  apiVersion: number;
};

export async function fetchApiHealth(): Promise<ApiHealthInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      authRoutes?: boolean;
      apiVersion?: number;
      auth?: string;
    };
    const authRoutes =
      data.authRoutes === true || data.apiVersion === 2 || data.auth === 'enabled';
    return {
      ok: data.ok === true,
      authRoutes,
      apiVersion: typeof data.apiVersion === 'number' ? data.apiVersion : authRoutes ? 2 : 1,
    };
  } catch {
    return null;
  }
}

export async function checkApiHealth(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && healthCache && now - healthCache.at < HEALTH_TTL_MS) {
    return healthCache.ok;
  }
  const info = await fetchApiHealth();
  const ok = info?.ok === true && info.authRoutes;
  healthCache = { ok, at: now };
  return ok;
}

export type FleetFetchResult =
  | { ok: true; fleet: FleetData }
  | { ok: false; unauthorized: boolean };

export async function fetchFleetFromApi(): Promise<FleetFetchResult> {
  try {
    const res = await fetch(`${API_BASE}/api/fleet`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401) return { ok: false, unauthorized: true };
    if (!res.ok) return { ok: false, unauthorized: false };
    return { ok: true, fleet: (await res.json()) as FleetData };
  } catch {
    return { ok: false, unauthorized: false };
  }
}

export async function createVehicleOnApi(payload: {
  label: string;
  vehicleImage?: string;
  ownerName?: string;
  monthlyGuarantee?: number;
  currentDriverName?: string;
  vehicleCost?: number;
  vehicleLifeYears?: number;
  assignedUserId: string;
}): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/fleet/vehicles`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string };
    return data.id;
  } catch {
    return null;
  }
}

export async function deleteVehicleOnApi(vehicleId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/fleet/vehicles/${encodeURIComponent(vehicleId)}`, {
      method: 'DELETE',
      headers: apiHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchVehicleStateFromApi(vehicleId: string): Promise<TaxiAppState | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/state`,
      { headers: apiHeaders(), signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    return (await res.json()) as TaxiAppState;
  } catch {
    return null;
  }
}

export async function persistVehicleStateToApi(
  vehicleId: string,
  state: TaxiAppState
): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/state`,
      {
        method: 'PUT',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(state),
        signal: AbortSignal.timeout(15000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** @deprecated */
export async function fetchAppStateFromApi(): Promise<TaxiAppState | null> {
  try {
    const res = await fetch(`${API_BASE}/api/state`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return (await res.json()) as TaxiAppState;
  } catch {
    return null;
  }
}

/** @deprecated */
export async function persistAppStateToApi(state: TaxiAppState): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/state`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(state),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
