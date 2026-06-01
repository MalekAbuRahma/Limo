import type { AssignableUser } from '../taxiTypes';
import type { UserRole, UserSession } from './taxiAuth';
import { checkApiHealth, getAuthHeaders } from './taxiApi';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
}

export type LoginApiResult =
  | { ok: true; token: string; user: AuthUser }
  | { ok: false; reason: 'invalid' | 'not_found' | 'network' };

export async function loginViaApi(
  username: string,
  password: string
): Promise<LoginApiResult> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { ok: false, reason: 'not_found' };
    if (!res.ok) return { ok: false, reason: 'invalid' };
    const data = (await res.json()) as { token: string; user: AuthUser };
    return { ok: true, ...data };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function logoutViaApi(token: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* ignore */
  }
}

export async function fetchCurrentUser(
  token: string
): Promise<{ user: AuthUser; token: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { user: AuthUser; token: string };
  } catch {
    return null;
  }
}

export async function restoreSessionFromApi(
  session: UserSession
): Promise<UserSession | null> {
  if (!session.token) return null;
  const apiUp = await checkApiHealth();
  if (!apiUp) return session;
  const me = await fetchCurrentUser(session.token);
  if (!me) return null;
  return {
    id: me.user.id,
    username: me.user.username,
    displayName: me.user.displayName,
    role: me.user.role,
    token: session.token,
    loggedInAt: session.loggedInAt,
  };
}

export interface AdminUserRecord extends AuthUser {
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchAdminUsers(token: string): Promise<AdminUserRecord[]> {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error('Failed to load users');
  const data = (await res.json()) as { users: AdminUserRecord[] };
  return data.users;
}

export async function createAdminUser(
  token: string,
  payload: { username: string; password: string; displayName: string; role: UserRole }
): Promise<AdminUserRecord> {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to create user');
  return (data as { user: AdminUserRecord }).user;
}

export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  try {
    const res = await fetch(`${API_BASE}/api/fleet/assignable-users`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { users: AssignableUser[] };
    return data.users ?? [];
  } catch {
    return [];
  }
}

export async function updateVehicleAssignmentOnApi(
  vehicleId: string,
  assignedUserId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/assignment`,
      {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assignedUserId }),
        signal: AbortSignal.timeout(10000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function updateAdminUser(
  token: string,
  userId: string,
  patch: {
    displayName?: string;
    role?: UserRole;
    active?: boolean;
    password?: string;
  }
): Promise<AdminUserRecord> {
  const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to update user');
  return (data as { user: AdminUserRecord }).user;
}
