import type { UserRole, UserSession } from './taxiAuth';

export function isAdmin(session: UserSession | null | undefined): boolean {
  return session?.role === 'admin';
}

/** Admins delete immediately; users request approval */
export function canDeleteVehicle(session: UserSession | null | undefined): boolean {
  return Boolean(session);
}

export function canDeleteImmediately(session: UserSession | null | undefined): boolean {
  return isAdmin(session);
}

export function canReviewDeletions(session: UserSession | null | undefined): boolean {
  return isAdmin(session);
}

export function canImportBackup(session: UserSession | null | undefined): boolean {
  return isAdmin(session);
}

/** All users may request; non-admins go through approval */
export function canClearAllEntries(session: UserSession | null | undefined): boolean {
  return Boolean(session);
}

export function canManageUsers(session: UserSession | null | undefined): boolean {
  return isAdmin(session);
}

export function canReassignVehicle(session: UserSession | null | undefined): boolean {
  return isAdmin(session);
}

export function vehicleVisibleToUser(
  vehicle: { assignedUserId?: string | null },
  session: UserSession | null | undefined
): boolean {
  if (!session) return false;
  if (isAdmin(session)) return true;
  return vehicle.assignedUserId === session.id;
}

export function roleLabel(role: UserRole, lang: 'ar' | 'en'): string {
  if (role === 'admin') return lang === 'ar' ? 'مدير' : 'Admin';
  return lang === 'ar' ? 'مستخدم' : 'User';
}
