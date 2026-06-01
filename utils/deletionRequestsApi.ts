import { getAuthHeaders } from './taxiApi';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type DeletionRequestType =
  | 'entry'
  | 'oil_change'
  | 'accident'
  | 'license'
  | 'vehicle'
  | 'clear_all_entries';

export type DeletionRequestStatus = 'pending' | 'approved' | 'rejected';

export interface DeletionRequestRecord {
  id: string;
  vehicleId: string;
  vehicleLabel: string;
  requestType: DeletionRequestType;
  targetId: string | null;
  summary: string;
  details: Record<string, unknown>;
  status: DeletionRequestStatus;
  requestedBy: string;
  requestedByName: string;
  requestedByUsername: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface CreateDeletionRequestPayload {
  vehicleId: string;
  requestType: DeletionRequestType;
  targetId?: string;
  summary: string;
  details?: Record<string, unknown>;
}

export async function submitDeletionRequest(
  payload: CreateDeletionRequestPayload
): Promise<DeletionRequestRecord | null> {
  try {
    const res = await fetch(`${API_BASE}/api/deletion-requests`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || 'Request failed');
    }
    const data = (await res.json()) as { request: DeletionRequestRecord };
    return data.request;
  } catch (e) {
    throw e instanceof Error ? e : new Error('Request failed');
  }
}

export async function fetchPendingDeletionCount(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/api/deletion-requests/pending-count`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { count: number };
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchDeletionRequests(
  status: 'pending' | 'all' = 'pending'
): Promise<DeletionRequestRecord[]> {
  const res = await fetch(
    `${API_BASE}/api/deletion-requests?status=${encodeURIComponent(status)}`,
    {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error('Failed to load deletion requests');
  const data = (await res.json()) as { requests: DeletionRequestRecord[] };
  return data.requests ?? [];
}

export async function approveDeletionRequest(
  id: string,
  reviewNote?: string
): Promise<DeletionRequestRecord> {
  const res = await fetch(`${API_BASE}/api/deletion-requests/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reviewNote: reviewNote ?? '' }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Approve failed');
  return (data as { request: DeletionRequestRecord }).request;
}

export async function rejectDeletionRequest(
  id: string,
  reviewNote?: string
): Promise<DeletionRequestRecord> {
  const res = await fetch(`${API_BASE}/api/deletion-requests/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reviewNote: reviewNote ?? '' }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Reject failed');
  return (data as { request: DeletionRequestRecord }).request;
}

export function deletionTypeLabel(type: DeletionRequestType, lang: 'ar' | 'en'): string {
  const labels: Record<DeletionRequestType, { ar: string; en: string }> = {
    entry: { ar: 'سجل شهري', en: 'Monthly entry' },
    oil_change: { ar: 'سجل زيت', en: 'Oil record' },
    accident: { ar: 'حادث', en: 'Accident' },
    license: { ar: 'ترخيص', en: 'License' },
    vehicle: { ar: 'سيارة كاملة', en: 'Whole vehicle' },
    clear_all_entries: { ar: 'كل السجلات الشهرية', en: 'All monthly entries' },
  };
  return labels[type][lang];
}
