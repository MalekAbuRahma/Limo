import { FleetData, TaxiAppState } from '../taxiTypes';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type StorageSource = 'sql' | 'local';

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchFleetFromApi(): Promise<FleetData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/fleet`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return (await res.json()) as FleetData;
  } catch {
    return null;
  }
}

export async function createVehicleOnApi(payload: {
  label: string;
  vehicleImage?: string;
}): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/fleet/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      { signal: AbortSignal.timeout(10000) }
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
        headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${API_BASE}/api/state`, { signal: AbortSignal.timeout(10000) });
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
