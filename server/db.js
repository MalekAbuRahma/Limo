import { initPool, closePool, getDatabaseLabel } from './pgPool.js';
import { initSchema, DEFAULT_VEHICLE_ID } from './schema.js';

/** Lazy load — avoids pulling TypeScript utils into plain `node` (e.g. db:init). */
async function fleet() {
  return import('./fleet.js');
}

export const databaseConnection = () => getDatabaseLabel();

export async function initDb() {
  await initPool();
  await initSchema();
}

export async function getFleet(actor) {
  const f = await fleet();
  return f.getFleet(actor);
}

export async function getVehicleState(vehicleId) {
  const f = await fleet();
  const state = await f.buildVehicleState(vehicleId);
  if (!state) throw new Error('Vehicle not found');
  return state;
}

export async function saveVehicleState(vehicleId, state) {
  const f = await fleet();
  await f.saveVehicleState(vehicleId, state);
}

export async function createVehicle(payload) {
  const f = await fleet();
  return f.createVehicle(payload);
}

export async function deleteVehicle(vehicleId) {
  const f = await fleet();
  const vehicles = await f.listVehicles();
  if (vehicles.length <= 1) {
    throw new Error('Cannot delete the last vehicle');
  }
  await f.deleteVehicle(vehicleId);
}

export async function updateVehicleAssignment(vehicleId, assignedUserId) {
  const f = await fleet();
  await f.updateVehicleAssignment(vehicleId, assignedUserId);
}

export async function saveFleetGlobalSettings(global) {
  const f = await fleet();
  await f.saveFleetGlobalSettings(global);
}

/** @deprecated use getVehicleState */
export async function getAppState() {
  const f = await fleet();
  const vehicles = await f.listVehicles();
  if (vehicles.length > 0) {
    return getVehicleState(vehicles[0].id);
  }
  return getVehicleState(DEFAULT_VEHICLE_ID);
}

/** @deprecated use saveVehicleState */
export async function saveAppState(state) {
  const f = await fleet();
  let vehicles = await f.listVehicles();
  if (vehicles.length === 0) {
    await f.createVehicle({
      label: state.settings?.vehicleLabel || 'VIP limousine CARS',
    });
    vehicles = await f.listVehicles();
  }
  const vehicleId = vehicles[0]?.id ?? DEFAULT_VEHICLE_ID;
  await saveVehicleState(vehicleId, state);
}

export async function closeDb() {
  await closePool();
}

/** Reset all tables — tests only */
export async function resetDbForTests() {
  await initPool();
  const { getPool } = await import('./pgPool.js');
  const pool = getPool();
  await pool.query(`
    TRUNCATE TABLE
      deletion_requests, auth_sessions, users,
      oil_changes, monthly_entries, accidents, annual_licenses, vehicles, fleet_settings
    RESTART IDENTITY CASCADE
  `);
  await initSchema();
}
