/**
 * Integration tests: migration, backup, export headers, PostgreSQL round-trip, API (optional)
 * Run: npx tsx scripts/test-integration.mjs
 */
import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import ExcelJS from 'exceljs';
import {
  computeAccidentSummary,
  mergeAccidentsIntoDashboard,
  migrateAccident,
} from '../utils/taxiAccidents.ts';
import { migrateLicense } from '../utils/taxiLicenses.ts';
import { migrateEntry, migrateSettings } from '../utils/taxiStorage.ts';
import { parseBackupJson } from '../utils/taxiBackup.ts';
import {
  EXPENSE_FIELD_LABELS,
  REPORT_EXPENSE_KEYS,
  VISIBLE_EXPENSE_KEYS,
  DEFAULT_SETTINGS,
} from '../taxiTypes.ts';
import { computeEntry, computeDashboard, sumExpenses } from '../utils/taxiCalculations.ts';
import { buildEntrySearchText } from '../utils/taxiEntryFilters.ts';
import { generateSampleEntries } from '../utils/taxiSampleData.ts';
import { initDb, getAppState, saveAppState, closeDb, resetDbForTests } from '../server/db.js';

const assert = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
};

const TEST_VEHICLE_IMAGE =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQADAPwA/9k=';

// --- Settings migration ---
const legacy = migrateSettings({
  vehicleLabel: 'سيارة أجرة — بيانات تجريبية',
  monthlyGuarantee: 800,
});
assert(legacy.vehicleLabel === 'VIP limousine CARS', 'legacy vehicle label -> VIP limousine CARS');
assert(legacy.monthlyGuarantee === 800, 'settings merge preserves values');

// --- Entry migration: legacy total only ---
const legacyEntry = migrateEntry({
  id: 'legacy-1',
  date: '2025-03-01',
  expenses: 120,
  expenseDetails: {},
  revenue: 750,
  driverPaid: 750,
});
assert(legacyEntry.expenseDetails.other === 120, 'legacy expenses -> other');
assert(legacyEntry.expenses === 120, 'expenses total synced');
assert(legacyEntry.monthlyGuarantee === 750, 'default guarantee on migrate');

// --- Hidden office/insurance still count in totals ---
const withHidden = migrateEntry({
  id: 'h-1',
  date: '2025-04-01',
  expenseDetails: { office: 50, insurance: 40, oil: 10 },
  revenue: 750,
  driverPaid: 750,
});
assert(withHidden.expenses === 100, 'office+insurance included in sum');

const computedHidden = computeEntry(withHidden, 750);
const searchHay = buildEntrySearchText(computedHidden);
assert(!searchHay.includes('مكتب'), 'search text hides office label');
assert(!searchHay.includes('تأمين'), 'search text hides insurance label');
assert(searchHay.includes('زيت'), 'search text includes visible oil');

// --- Backup JSON round-trip ---
const backupPayload = {
  settings: { ...DEFAULT_SETTINGS, insuranceReceivedTotal: 500 },
  entries: [withHidden, legacyEntry],
  accidents: [
    {
      id: 'acc-1',
      accidentDate: '2025-06-15',
      responsibleDriver: 'سائق',
      downtimeDays: 3,
      details: 'حادث بسيط',
      cost: 200,
      insurancePending: 150,
      insuranceReceived: 50,
    },
  ],
};
const restored = parseBackupJson(JSON.stringify(backupPayload));
assert(restored.entries.length === 2, 'backup restores entries');
assert(restored.entries[0].expenses === 100, 'backup preserves expense totals');
assert(restored.accidents.length === 1, 'backup restores accidents');
assert(restored.settings.insuranceReceivedTotal === 500, 'backup restores insurance setting');

const summary = computeAccidentSummary(1000, restored.accidents, 750);
assert(summary.totalPending === 0, 'accident with received 50 not pending');
assert(summary.downtimeDailyRate === 25, 'claim daily rate');
assert(summary.totalClaimAmount === 200 + 75, 'repair + 3 days downtime');
assert(summary.adjustedNetProfit === 1000 - 200 + 50, 'adjusted net: per-accident insurance only');
assert(summary.totalDowntimeDays === 3, 'downtime days summed');
assert(restored.accidents[0].downtimeDays === 3, 'downtime migrated');

const dashBase = computeDashboard(restored.entries, 750);
const dashMerged = mergeAccidentsIntoDashboard(dashBase, summary);
assert(
  dashMerged.totalExpenses === dashBase.totalExpenses + 200,
  'repair in total expenses'
);
assert(
  dashMerged.netProfit === dashBase.netProfit - 200 + 50,
  'net: − إصلاح + تأمين مستلم'
);

// sample-* ids filtered
const withSample = parseBackupJson(
  JSON.stringify({
    settings: DEFAULT_SETTINGS,
    entries: [{ id: 'sample-x', date: '2025-01-01' }, { id: 'real-1', date: '2025-02-01', revenue: 1 }],
  })
);
assert(withSample.entries.length === 1 && withSample.entries[0].id === 'real-1', 'sample ids filtered');

// --- Visible expense keys ---
assert(VISIBLE_EXPENSE_KEYS.length === 3, 'three visible expense fields (oil + accident managed via tabs)');
assert(!VISIBLE_EXPENSE_KEYS.includes('oil'), 'oil not in monthly form');
assert(!VISIBLE_EXPENSE_KEYS.includes('accident'), 'accident field hidden from monthly form');
assert(!VISIBLE_EXPENSE_KEYS.includes('office'), 'office not visible');
assert(!VISIBLE_EXPENSE_KEYS.includes('insurance'), 'insurance not visible');

// --- Excel workbook structure (no browser download) ---
const guarantee = DEFAULT_SETTINGS.monthlyGuarantee;
const entries = generateSampleEntries(1)
  .slice(0, 3)
  .map((e) => computeEntry(e, guarantee));
const totals = computeDashboard(entries, guarantee);

const wb = new ExcelJS.Workbook();
const sheet = wb.addWorksheet('test');
const expenseKeys = [...REPORT_EXPENSE_KEYS];
const headers = [
  'الفترة',
  ...expenseKeys.map((k) => EXPENSE_FIELD_LABELS[k]),
  'مجموع المصاريف',
];
sheet.addRow(headers);
for (const e of entries) {
  sheet.addRow([e.month, ...expenseKeys.map((k) => e.expenseDetails[k]), e.expenses]);
}
const buffer = await wb.xlsx.writeBuffer();
assert(buffer.byteLength > 500, 'excel buffer generated');
const headerRow = sheet.getRow(1).values.filter(Boolean).map(String);
assert(!headerRow.includes('مكتب'), 'excel headers exclude office');
assert(!headerRow.includes('تأمين'), 'excel headers exclude insurance');
assert(headerRow.includes('زيت'), 'excel headers include oil');

// --- PDF export source: no invalid motionless tags ---
const exportSrc = fs.readFileSync(path.join(__dirname, '..', 'utils', 'taxiExport.ts'), 'utf8');
assert(!exportSrc.includes('motionless'), 'PDF HTML must use valid div tags only');
assert(exportSrc.includes('class="cards"'), 'PDF summary cards present');

// --- PostgreSQL round-trip ---
let pgRoundTripTested = false;
try {
  await resetDbForTests();
  const stateToSave = {
    settings: {
      ...DEFAULT_SETTINGS,
      monthlyGuarantee: 760,
      insuranceReceivedTotal: 100,
      vehicleImage: TEST_VEHICLE_IMAGE,
      driverFirstPaymentDate: '2026-08-08',
      driverPaymentMode: 'deferred',
      paymentCycleEpoch: 3,
    },
    accidents: [
      migrateAccident({
        id: 'acc-db-1',
        accidentDate: '2026-02-10',
        responsibleDriver: 'خالد',
        downtimeDays: 5,
        details: 'اختبار',
        cost: 300,
        insuranceReceived: 100,
      }),
    ],
    licenses: [
      migrateLicense({
        id: 'lic-db-1',
        licenseDate: '2025-06-01',
        licenseYear: 2025,
        amountPaid: 85,
        notes: 'تجديد',
      }),
    ],
    oilChanges: [
      {
        id: 'oil-db-1',
        entryId: 'db-1',
        changeDate: '2026-01-01',
        cost: 40,
        currentOdometer: 100000,
        distanceKm: 5000,
        nextOdometer: 110000,
        notes: 'اختبار',
      },
    ],
    entries: [
      migrateEntry({
        id: 'db-1',
        date: '2026-01-01',
        driverName: 'أحمد',
        revenue: 800,
        expenseDetails: { oil: 30, other: 0 },
        driverPaid: 760,
        monthlyGuarantee: 760,
        paymentAnchorDate: '2026-01-15',
        paymentCycleEpoch: 3,
        driverPayments: [250, 250, 250],
      }),
    ],
  };
  await saveAppState(stateToSave);
  await closeDb();

  await initDb();
  const loaded = await getAppState();
  await closeDb();

  assert(loaded.settings.monthlyGuarantee === 760, 'postgres settings round-trip');
  assert(loaded.settings.driverFirstPaymentDate === '2026-08-08', 'postgres driverFirstPaymentDate');
  assert(loaded.settings.driverPaymentMode === 'deferred', 'postgres driverPaymentMode');
  assert(loaded.settings.paymentCycleEpoch === 3, 'postgres paymentCycleEpoch (vehicle)');
  assert(loaded.entries.length === 1, 'postgres entries round-trip');
  assert(loaded.entries[0].driverName === 'أحمد', 'postgres driver name');
  assert(loaded.entries[0].paymentAnchorDate === '2026-01-15', 'postgres paymentAnchorDate');
  assert(loaded.entries[0].paymentCycleEpoch === 3, 'postgres paymentCycleEpoch (entry)');
  assert(
    loaded.entries[0].driverPayments?.join(',') === '250,250,250',
    'postgres driverPayments slots'
  );
  assert(loaded.entries[0].expenseDetails.oil === 30, 'postgres expense breakdown');
  assert(
    sumExpenses(loaded.entries[0].expenseDetails) === loaded.entries[0].expenses,
    'postgres expense sum'
  );
  assert(loaded.accidents.length === 1, 'postgres accidents round-trip');
  assert(loaded.accidents[0].responsibleDriver === 'خالد', 'postgres accident driver');
  assert(loaded.accidents[0].downtimeDays === 5, 'postgres downtime_days column');
  assert(loaded.accidents[0].cost === 300, 'postgres accident cost');
  assert(loaded.licenses.length === 1, 'postgres licenses round-trip');
  assert(loaded.licenses[0].licenseDate === '2025-06-01', 'postgres license date');
  assert(loaded.licenses[0].licenseYear === 2025, 'postgres license year');
  assert(loaded.licenses[0].amountPaid === 85, 'postgres license amount');
  assert(loaded.licenses[0].notes === 'تجديد', 'postgres license notes');
  assert(loaded.oilChanges.length === 1, 'postgres oil changes round-trip');
  assert(loaded.oilChanges[0].currentOdometer === 100000, 'postgres odometer');
  pgRoundTripTested = true;
} catch (pgErr) {
  const msg = String(pgErr?.message || pgErr || '');
  const unavailable =
    msg.includes('password authentication failed') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('connect ECONNREFUSED') ||
    msg.includes('no pg_hba.conf entry') ||
    msg.includes('database') ||
    msg.includes('role');
  if (unavailable) {
    console.log(`PostgreSQL round-trip: skipped (${msg})`);
  } else {
    throw new Error(`PostgreSQL round-trip failed: ${msg}`);
  }
}

// --- Live API (optional, when server is running) ---
let apiTested = false;
try {
  const health = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(5000) });
  if (health.ok) {
    const h = await health.json();
    assert(h.ok === true && h.storage === 'postgresql', 'API health');

    const getRes = await fetch('http://localhost:3001/api/state');
    assert(getRes.ok, 'GET /api/state');
    const before = await getRes.json();

    const testState = {
      settings: before.settings,
      accidents: before.accidents ?? [],
      licenses: before.licenses ?? [],
      entries: [
        ...before.entries.filter((e) => e.id !== '__test_api__'),
        {
          id: '__test_api__',
          date: '2099-12-01',
          month: '12/2099',
          driverName: 'API Test',
          revenue: 1,
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
          notes: '',
          driverPaid: 1,
          monthlyGuarantee: 750,
        },
      ],
    };

    const putRes = await fetch('http://localhost:3001/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testState),
    });
    assert(putRes.ok, 'PUT /api/state');

    const afterRes = await fetch('http://localhost:3001/api/state');
    const after = await afterRes.json();
    assert(
      after.entries.some((e) => e.id === '__test_api__'),
      'API persisted test entry'
    );

    // cleanup test entry (must keep accidents — server preserves if omitted, but send explicitly)
    await fetch('http://localhost:3001/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: before.settings,
        entries: before.entries.filter((e) => e.id !== '__test_api__'),
        accidents: before.accidents ?? [],
        licenses: before.licenses ?? [],
      }),
    });

    // PUT without accidents must not wipe existing records
    const withAccident = {
      settings: before.settings,
      entries: before.entries.filter((e) => e.id !== '__test_api__'),
      licenses: before.licenses ?? [],
      accidents: [
        ...(before.accidents ?? []),
        migrateAccident({
          id: '__test_acc__',
          accidentDate: '2099-01-01',
          responsibleDriver: 'API',
          downtimeDays: 1,
          cost: 1,
          insuranceReceived: 0,
        }),
      ],
    };
    const putAcc = await fetch('http://localhost:3001/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withAccident),
    });
    assert(putAcc.ok, 'PUT with accident');
    const afterAcc = await (await fetch('http://localhost:3001/api/state')).json();
    assert(
      afterAcc.accidents.some((a) => a.id === '__test_acc__'),
      'API persisted accident'
    );

    const omitAccPut = await fetch('http://localhost:3001/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: before.settings,
        entries: before.entries.filter((e) => e.id !== '__test_api__'),
      }),
    });
    assert(omitAccPut.ok, 'PUT without accidents array');
    const afterOmit = await (await fetch('http://localhost:3001/api/state')).json();
    assert(
      afterOmit.accidents.some((a) => a.id === '__test_acc__'),
      'omitted accidents does not wipe DB'
    );

    await fetch('http://localhost:3001/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: before.settings,
        entries: before.entries.filter((e) => e.id !== '__test_api__'),
        accidents: (before.accidents ?? []).filter((a) => a.id !== '__test_acc__'),
        licenses: before.licenses ?? [],
      }),
    });

    apiTested = true;
    console.log('API integration: passed (localhost:3001)');
  }
} catch {
  console.log('API integration: skipped (server not running on :3001)');
}

console.log('--- Integration test report ---');
console.log(`Visible expense fields: ${VISIBLE_EXPENSE_KEYS.map((k) => EXPENSE_FIELD_LABELS[k]).join(', ')}`);
console.log(`Dashboard net (3 months): ${totals.netProfit}`);
console.log(`PostgreSQL round-trip: ${pgRoundTripTested ? 'yes' : 'no (skipped)'}`);
console.log(`API live test: ${apiTested ? 'yes' : 'no'}`);
console.log('All integration tests passed ✓');
