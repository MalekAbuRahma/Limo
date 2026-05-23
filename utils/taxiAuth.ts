export interface UserSession {
  username: string;
  displayName: string;
  userId: string;
  loggedInAt: number;
}

const SESSION_KEY = 'taxi_tracker_session';
const USER_ID_KEY = 'taxi_tracker_user_id';

export function getStoredUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = String(1_000_000_000 + Math.floor(Math.random() * 900_000_000));
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function getSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSession;
    if (!parsed?.username || !parsed?.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createSession(username: string): UserSession {
  const displayName = username.trim() || 'مستخدم';
  return {
    username: displayName,
    displayName,
    userId: getStoredUserId(),
    loggedInAt: Date.now(),
  };
}

export function saveSession(session: UserSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** Client-side gate for single-user local app */
export function validateLogin(username: string, password: string): boolean {
  const u = username.trim();
  if (!u) return false;
  if (!password.trim()) return true;
  const demoPairs: Record<string, string> = {
    malek: '1234',
    admin: 'admin',
    مستخدم: '1234',
  };
  const expected = demoPairs[u.toLowerCase()];
  if (expected) return password === expected;
  return password.length >= 4;
}
