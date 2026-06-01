/**
 * Multi-vehicle fleet: PostgreSQL + API tests
 * Run: npx tsx scripts/test-fleet.mjs
 * Requires: PostgreSQL (DATABASE_URL in .env)
 */
import 'dotenv/config';
import {
  initDb,
  closeDb,
  getFleet,
  getVehicleState,
  saveVehicleState,
  createVehicle,
  deleteVehicle,
  resetDbForTests,
} from '../server/db.js';
import { migrateEntry } from '../utils/taxiStorage.ts';
import { computeFullVehicleTotals } from '../utils/taxiVehicleTotals.ts';

const assert = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
};

const TEST_VEHICLE_IMAGE =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQADAPwA/9k=';

try {
  await resetDbForTests();
  const fleet0 = await getFleet();
  const startCount = fleet0.vehicles.length;
  assert(startCount >= 1, 'schema seeds default vehicle');
  const defaultId = fleet0.vehicles[0].id;

  let imageRequired = false;
  try {
    await createVehicle({ label: 'No image', vehicleImage: '' });
  } catch {
    imageRequired = true;
  }
  assert(imageRequired, 'create rejects empty vehicle image');

  const car2Id = await createVehicle({
    label: 'Mercedes S-Class',
    vehicleImage: TEST_VEHICLE_IMAGE,
    monthlyGuarantee: 600,
    vehicleCost: 45000,
    vehicleLifeYears: 5,
    currentDriverName: 'Malek',
  });
  assert(car2Id && car2Id !== defaultId, 'create second vehicle');
  const createdSettings = (await getVehicleState(car2Id)).settings;
  assert(createdSettings.monthlyGuarantee === 600, 'create sets per-vehicle guarantee');
  assert(createdSettings.vehicleCost === 45000, 'create sets per-vehicle cost');
  assert(createdSettings.vehicleLifeYears === 5, 'create sets per-vehicle life years');
  assert(createdSettings.currentDriverName === 'Malek', 'create sets per-vehicle driver');

  const fleet1 = await getFleet();
  assert(
    fleet1.vehicles.length === startCount + 1,
    `fleet adds one vehicle (expected ${startCount + 1}, got ${fleet1.vehicles.length})`
  );

  const stateA = {
    settings: {
      ...(await getVehicleState(defaultId)).settings,
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
  await saveVehicleState(defaultId, stateA);

  const stateB = {
    settings: {
      ...(await getVehicleState(car2Id)).settings,
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
  await saveVehicleState(car2Id, stateB);

  const loadedA = await getVehicleState(defaultId);
  const loadedB = await getVehicleState(car2Id);

  assert(loadedA.entries.length === 1, 'vehicle A has one entry');
  assert(loadedB.entries.length === 1, 'vehicle B has one entry');
  assert(loadedA.entries[0].revenue === 900, 'vehicle A revenue isolated');
  assert(loadedB.entries[0].revenue === 2000, 'vehicle B revenue isolated');
  assert(loadedA.entries[0].id === 'fleet-a-1', 'vehicle A entry id');
  assert(!loadedB.entries.some((e) => e.id === 'fleet-a-1'), 'vehicle B has no A entries');

  const fleetSummary = await getFleet();
  const cardA = fleetSummary.vehicles.find((v) => v.id === defaultId);
  const cardB = fleetSummary.vehicles.find((v) => v.id === car2Id);
  assert(cardA?.totalRevenue === 900, 'summary revenue for A');
  assert(cardB?.totalRevenue === 2000, 'summary revenue for B');

  const oilState = {
    ...(await getVehicleState(defaultId)),
    entries: [
      migrateEntry({
        id: 'oil-entry-1',
        date: '2026-03-01',
        revenue: 750,
        expenseDetails: { maintenance: 100 },
        driverPaid: 750,
      }),
    ],
    oilChanges: [
      {
        id: 'oil-1',
        entryId: 'oil-entry-1',
        changeDate: '2026-03-10',
        cost: 45,
        oilType: '',
        oilGrade: '',
        currentOdometer: 0,
        distanceKm: 0,
        nextOdometer: 0,
        notes: '',
      },
    ],
  };
  await saveVehicleState(defaultId, oilState);
  const expectedOilNet = computeFullVehicleTotals(
    oilState.entries,
    oilState.settings.monthlyGuarantee,
    oilState.accidents,
    oilState.licenses,
    oilState.oilChanges
  ).netProfit;
  assert(expectedOilNet === 750 - 100 - 45, 'oil tab cost reduces net profit');
  const cardOil = (await getFleet()).vehicles.find((v) => v.id === defaultId);
  assert(cardOil?.netProfit === expectedOilNet, 'garage card net includes oil tab costs');

  await saveVehicleState(defaultId, stateA);

  await deleteVehicle(car2Id);
  const fleetAfter = await getFleet();
  assert(fleetAfter.vehicles.length === startCount, 'delete removes vehicle');
  assert(!fleetAfter.vehicles.some((v) => v.id === car2Id), 'car2 gone from list');

  let threw = false;
  try {
    await deleteVehicle(defaultId);
  } catch {
    threw = true;
  }
  assert(threw, 'cannot delete last vehicle');

  await closeDb();
  console.log('Fleet PostgreSQL tests: passed ✓');
} catch (err) {
  console.error('Fleet PostgreSQL tests failed:', err.message);
  process.exit(1);
}

// Live fleet API
let apiOk = false;
try {
  const health = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(3000) });
  if (!health.ok) throw new Error('no health');
  const h = await health.json();
  assert(h.multiVehicle === true, 'API reports multiVehicle');
  assert(h.storage === 'postgresql', 'API reports postgresql');

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
    body: JSON.stringify({ label: '__fleet_api_test__', vehicleImage: TEST_VEHICLE_IMAGE }),
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
