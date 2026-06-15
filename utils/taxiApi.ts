import {
  FleetData,
  TaxiAppState,
  DriverProfile,
  DriverAssignmentEntry,
  DriverSettlement,
  FleetPerformanceRanking,
  AuditLogEntry,
} from '../taxiTypes';

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

// ── Driver History API ──────────────────────────────────────────────────────

export interface VehicleDriver {
  id: string;
  vehicleId: string;
  name: string;
  startDate: string;
  endDate: string | null;
  notes: string;
  monthlyGuarantee: number;
  createdAt?: string;
}

export async function fetchVehicleDrivers(vehicleId: string): Promise<VehicleDriver[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers`,
      { headers: apiHeaders(), signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { drivers?: VehicleDriver[] };
    return data.drivers ?? [];
  } catch {
    return [];
  }
}

export async function addVehicleDriverApi(
  vehicleId: string,
  payload: { name: string; startDate: string; endDate?: string | null; notes?: string }
): Promise<VehicleDriver | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers`,
      {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? 'فشل إضافة السائق');
    }
    const data = await res.json() as { driver: VehicleDriver };
    return data.driver;
  } catch (err) {
    throw err;
  }
}

export async function stopVehicleDriverApi(
  vehicleId: string,
  driverId: string,
  endDate: string
): Promise<VehicleDriver | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers/${encodeURIComponent(driverId)}/stop`,
      {
        method: 'PATCH',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ endDate }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? 'فشل إيقاف السائق');
    }
    const data = await res.json() as { driver: VehicleDriver };
    return data.driver;
  } catch (err) {
    throw err;
  }
}

export async function updateVehicleDriverApi(
  vehicleId: string,
  driverId: string,
  payload: { name?: string; startDate?: string; endDate?: string | null; monthlyGuarantee?: number; notes?: string }
): Promise<VehicleDriver | null> {
  const res = await fetch(
    `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers/${encodeURIComponent(driverId)}`,
    {
      method: 'PATCH',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'فشل تعديل السائق');
  }
  const data = await res.json() as { driver: VehicleDriver };
  return data.driver;
}

export async function deleteVehicleDriverApi(
  vehicleId: string,
  driverId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers/${encodeURIComponent(driverId)}`,
    {
      method: 'DELETE',
      headers: apiHeaders(),
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'فشل حذف السائق');
  }
}

// ─── F1: Driver Running Balance ───────────────────────────────────────────────

export async function fetchDriverBalance(
  vehicleId: string,
  driverId: string
): Promise<{ currentOutstandingBalance: number; ledger: unknown[] } | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers/${encodeURIComponent(driverId)}/balance`,
      { headers: apiHeaders(), signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── F2: Driver Withdrawal ────────────────────────────────────────────────────

export async function withdrawDriverApi(
  vehicleId: string,
  driverId: string,
  endDate: string,
  monthlyGuarantee: number
): Promise<{
  daysWorked: number;
  proratedGuarantee: number;
  remainingBalance: number;
  suggestedNextAnchorDate: string;
}> {
  const res = await fetch(
    `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers/${encodeURIComponent(driverId)}/withdraw`,
    {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ endDate, monthlyGuarantee }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'فشل إنهاء خدمة السائق');
  }
  return res.json();
}

// ─── F3: Driver Replacement ───────────────────────────────────────────────────

export async function replaceDriverApi(
  vehicleId: string,
  params: {
    currentDriverId?: string | null;
    currentDriverEndDate?: string | null;
    newDriverName: string;
    newDriverStartDate: string;
    monthlyGuarantee: number;
  }
): Promise<{
  newDriverId: string;
  newDriverName: string;
  newDriverStartDate: string;
  suggestedAnchor: string;
}> {
  const res = await fetch(
    `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers/replace`,
    {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'فشل تبديل السائق');
  }
  return res.json();
}

// ─── F6: Driver Settlement ────────────────────────────────────────────────────

export async function fetchDriverSettlement(
  vehicleId: string,
  driverId: string
): Promise<DriverSettlement | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers/${encodeURIComponent(driverId)}/settlement`,
      { headers: apiHeaders(), signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── F4: Audit Log ────────────────────────────────────────────────────────────

export async function fetchAuditLog(params: {
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AuditLogEntry[]> {
  const query = new URLSearchParams();
  if (params.entityType) query.set('entityType', params.entityType);
  if (params.entityId) query.set('entityId', params.entityId);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  try {
    const res = await fetch(`${API_BASE}/api/audit-log?${query}`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { entries: AuditLogEntry[] };
    return data.entries ?? [];
  } catch {
    return [];
  }
}

// ─── F7: Active Driver Check ──────────────────────────────────────────────────

export async function fetchActiveDriver(vehicleId: string): Promise<DriverProfile | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers/active`,
      { headers: apiHeaders(), signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { driver: DriverProfile | null };
    return data.driver;
  } catch {
    return null;
  }
}

// ─── F8: Fleet Performance Ranking ───────────────────────────────────────────

export async function fetchFleetPerformanceRanking(): Promise<FleetPerformanceRanking | null> {
  try {
    const res = await fetch(`${API_BASE}/api/fleet/performance-ranking`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Driver Profile Update ────────────────────────────────────────────────────

export async function updateDriverProfileApi(
  vehicleId: string,
  driverId: string,
  updates: Partial<Pick<DriverProfile, 'phoneNumber' | 'nationalId' | 'emergencyContact' | 'driverNotes' | 'notes'>>
): Promise<DriverProfile> {
  const res = await fetch(
    `${API_BASE}/api/vehicles/${encodeURIComponent(vehicleId)}/drivers/${encodeURIComponent(driverId)}/profile`,
    {
      method: 'PATCH',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'فشل تحديث بيانات السائق');
  }
  const data = await res.json() as { driver: DriverProfile };
  return data.driver;
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
