export type UserRole = 'admin' | 'user';

export interface UserSession {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  token?: string;
  loggedInAt: number;
}

const SESSION_KEY = 'taxi_tracker_session';

export function getSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSession;
    if (!parsed?.username || !parsed?.id) return null;
    if (!parsed.role) parsed.role = 'user';
    return parsed;
  } catch {
    return null;
  }
}

export function sessionFromApiUser(
  user: { id: string; username: string; displayName: string; role: UserRole },
  token: string
): UserSession {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    token,
    loggedInAt: Date.now(),
  };
}

export function createOfflineSession(username: string, role: UserRole = 'user'): UserSession {
  const name = username.trim() || 'مستخدم';
  const key = name.toLowerCase();
  return {
    id: `offline-${key}`,
    username: key,
    displayName: name,
    role,
    loggedInAt: Date.now(),
  };
}

export function saveSession(session: UserSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** Offline fallback when API is unavailable */
export function validateOfflineLogin(username: string, password: string): UserRole | null {
  const u = username.trim().toLowerCase();
  if (!u) return null;
  if (!password.trim()) return null;

  const demoPairs: Record<string, { passwords: string[]; role: UserRole }> = {
    admin: { passwords: ['admin', '1234'], role: 'admin' },
    malek: { passwords: ['1234'], role: 'admin' },
    saleh: { passwords: ['1234'], role: 'user' },
    مستخدم: { passwords: ['1234'], role: 'user' },
  };

  const demo = demoPairs[u];
  if (demo && demo.passwords.includes(password)) return demo.role;
  if (password.length >= 4) return 'user';
  return null;
}
