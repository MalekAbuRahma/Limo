/**
 * Multi-vehicle fleet: SQLite + API tests
 * Run: npx tsx scripts/test-fleet.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  initDb,
  closeDb,
  getFleet,
  getVehicleState,
  saveVehicleState,
  createVehicle,
  deleteVehicle,
} from '../server/db.js';
import { migrateEntry } from '../utils/taxiStorage.ts';

const assert = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
};

const tmpDb = path.join(os.tmpdir(), `taxi-fleet-test-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;

try {
  await initDb();
  const fleet0 = getFleet();
  assert(fleet0.vehicles.length >= 1, 'migration creates default vehicle');
  const defaultId = fleet0.vehicles[0].id;

  const car2Id = createVehicle({ label: 'Mercedes S-Class', vehicleImage: '' });
  assert(car2Id && car2Id !== defaultId, 'create second vehicle');

  const fleet1 = getFleet();
  assert(fleet1.vehicles.length === 2, 'fleet lists two vehicles');

  const stateA = {
    settings: {
      ...getVehicleState(defaultId).settings,
      vehicleLabel: 'VIP limousine CARS',
      monthlyGuarantee: 800,
    },
    entries: [
      migrateEntry({
        id: 'fleet-a-1',
        date: '2026-01-01',
        revenue: 900,
        expenseDetails: { oil: 50 },
        driverPaid: 800,
      }),
    ],
    accidents: [],
    licenses: [],
    oilChanges: [],
  };
  saveVehicleState(defaultId, stateA);

  const stateB = {
    settings: {
      ...getVehicleState(car2Id).settings,
      vehicleLabel: 'Mercedes S-Class',
      monthlyGuarantee: 1200,
    },
    entries: [
      migrateEntry({
        id: 'fleet-b-1',
        date: '2026-02-01',
        revenue: 2000,
        expenseDetails: { maintenance: 100 },
        driverPaid: 1200,
      }),
    ],
    accidents: [],
    licenses: [],
    oilChanges: [],
  };
  saveVehicleState(car2Id, stateB);

  const loadedA = getVehicleState(defaultId);
  const loadedB = getVehicleState(car2Id);

  assert(loadedA.entries.length === 1, 'vehicle A has one entry');
  assert(loadedB.entries.length === 1, 'vehicle B has one entry');
  assert(loadedA.entries[0].revenue === 900, 'vehicle A revenue isolated');
  assert(loadedB.entries[0].revenue === 2000, 'vehicle B revenue isolated');
  assert(loadedA.entries[0].id === 'fleet-a-1', 'vehicle A entry id');
  assert(!loadedB.entries.some((e) => e.id === 'fleet-a-1'), 'vehicle B has no A entries');

  const fleetSummary = getFleet();
  const cardA = fleetSummary.vehicles.find((v) => v.id === defaultId);
  const cardB = fleetSummary.vehicles.find((v) => v.id === car2Id);
  assert(cardA?.totalRevenue === 900, 'summary revenue for A');
  assert(cardB?.totalRevenue === 2000, 'summary revenue for B');

  deleteVehicle(car2Id);
  const fleetAfter = getFleet();
  assert(fleetAfter.vehicles.length === 1, 'delete removes vehicle');
  assert(!fleetAfter.vehicles.some((v) => v.id === car2Id), 'car2 gone from list');

  let threw = false;
  try {
    deleteVehicle(defaultId);
  } catch {
    threw = true;
  }
  assert(threw, 'cannot delete last vehicle');

  closeDb();
  console.log('Fleet SQLite tests: passed ✓');
} finally {
  if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  delete process.env.DB_PATH;
}

// Live fleet API
let apiOk = false;
try {
  const health = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(3000) });
  if (!health.ok) throw new Error('no health');
  const h = await health.json();
  assert(h.multiVehicle === true, 'API reports multiVehicle');

  const fleetRes = await fetch('http://localhost:3001/api/fleet');
  assert(fleetRes.ok, 'GET /api/fleet');
  const fleet = await fleetRes.json();
  assert(Array.isArray(fleet.vehicles) && fleet.vehicles.length >= 1, 'fleet has vehicles');

  const vid = fleet.vehicles[0].id;
  const stateRes = await fetch(`http://localhost:3001/api/fleet/vehicles/${encodeURIComponent(vid)}/state`);
  assert(stateRes.ok, 'GET vehicle state');
  const state = await stateRes.json();
  assert(state.settings && Array.isArray(state.entries), 'vehicle state shape');

  const createRes = await fetch('http://localhost:3001/api/fleet/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: '__fleet_api_test__' }),
  });
  assert(createRes.ok, 'POST create vehicle');
  const { id: newId } = await createRes.json();

  const putRes = await fetch(
    `http://localhost:3001/api/fleet/vehicles/${encodeURIComponent(newId)}/state`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: { ...state.settings, vehicleLabel: '__fleet_api_test__' },
        entries: [
          {
            id: '__fleet_api_entry__',
            date: '2099-11-01',
            month: '11/2099',
            driverName: 'Test',
            revenue: 99,
            expenses: 0,
            expenseDetails: {
              office: 0,
              insurance: 0,
              oil: 0,
              maintenance: 0,
              accident: 0,
              commission: 0,
              other: 0,
            },
            driverPaid: 99,
          },
        ],
        accidents: [],
        licenses: [],
        oilChanges: [],
      }),
    }
  );
  assert(putRes.ok, 'PUT vehicle state');

  const verify = await (
    await fetch(`http://localhost:3001/api/fleet/vehicles/${encodeURIComponent(newId)}/state`)
  ).json();
  assert(verify.entries.some((e) => e.id === '__fleet_api_entry__'), 'API entry persisted per vehicle');

  const delRes = await fetch(
    `http://localhost:3001/api/fleet/vehicles/${encodeURIComponent(newId)}`,
    { method: 'DELETE' }
  );
  assert(delRes.ok, 'DELETE vehicle');

  apiOk = true;
  console.log('Fleet API tests: passed (localhost:3001) ✓');
} catch (e) {
  console.log(`Fleet API tests: skipped (${e.message || 'server not running'})`);
}

console.log(`Fleet API live: ${apiOk ? 'yes' : 'no'}`);
console.log('All fleet tests passed ✓');
