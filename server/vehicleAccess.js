import { getPool } from './pgPool.js';

export async function getVehicleAssignedUserId(vehicleId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT assigned_user_id FROM vehicles WHERE id = $1`,
    [vehicleId]
  );
  return rows[0]?.assigned_user_id ?? null;
}

export async function assertVehicleAccess(actor, vehicleId) {
  if (!actor) {
    const err = new Error('Authentication required');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  if (actor.role === 'admin') return;

  const assigned = await getVehicleAssignedUserId(vehicleId);
  if (!assigned || assigned !== actor.id) {
    const err = new Error('You do not have access to this vehicle');
    err.code = 'VEHICLE_ACCESS_DENIED';
    throw err;
  }
}

export async function assertUserCanReceiveVehicle(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND active = TRUE`,
    [userId]
  );
  if (!rows.length) {
    const err = new Error('Invalid or inactive user');
    err.code = 'INVALID_ASSIGNED_USER';
    throw err;
  }
}

export function resolveAssignedUserIdForCreate(actor, requestedUserId) {
  if (actor.role === 'admin') {
    const id = String(requestedUserId ?? '').trim();
    if (!id) {
      const err = new Error('Select a user for this vehicle');
      err.code = 'ASSIGNED_USER_REQUIRED';
      throw err;
    }
    return id;
  }
  return actor.id;
}
