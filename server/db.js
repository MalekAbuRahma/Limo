import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fleet from './fleet.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const databaseFile = process.env.DB_PATH || path.join(dataDir, 'taxi.db');

let db = null;

function persistToDisk() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(databaseFile, Buffer.from(data));
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      monthly_guarantee REAL NOT NULL DEFAULT 750,
      current_driver_name TEXT NOT NULL DEFAULT '',
      vehicle_label TEXT NOT NULL DEFAULT 'VIP limousine CARS',
      vehicle_cost REAL NOT NULL DEFAULT 33000,
      vehicle_life_years INTEGER NOT NULL DEFAULT 7,
      font_size TEXT NOT NULL DEFAULT 'normal',
      display_theme TEXT NOT NULL DEFAULT 'default',
      bold_numbers INTEGER NOT NULL DEFAULT 0,
      large_buttons INTEGER NOT NULL DEFAULT 0,
      comfortable_reading INTEGER NOT NULL DEFAULT 0,
      insurance_received_total REAL NOT NULL DEFAULT 0
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS accidents (
      id TEXT PRIMARY KEY,
      accident_date TEXT NOT NULL,
      responsible_driver TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      cost REAL NOT NULL DEFAULT 0,
      insurance_pending REAL NOT NULL DEFAULT 0,
      insurance_received REAL NOT NULL DEFAULT 0,
      downtime_days INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_accidents_date ON accidents(accident_date);`);
  db.run(`
    CREATE TABLE IF NOT EXISTS monthly_entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      month TEXT NOT NULL DEFAULT '',
      driver_name TEXT NOT NULL DEFAULT '',
      revenue REAL NOT NULL DEFAULT 0,
      expenses REAL NOT NULL DEFAULT 0,
      expense_office REAL NOT NULL DEFAULT 0,
      expense_insurance REAL NOT NULL DEFAULT 0,
      expense_oil REAL NOT NULL DEFAULT 0,
      expense_maintenance REAL NOT NULL DEFAULT 0,
      expense_commission REAL NOT NULL DEFAULT 0,
      expense_accident REAL NOT NULL DEFAULT 0,
      expense_other REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      driver_paid REAL NOT NULL DEFAULT 0,
      monthly_guarantee REAL
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_monthly_entries_date ON monthly_entries(date);`);
  db.run(`
    CREATE TABLE IF NOT EXISTS annual_licenses (
      id TEXT PRIMARY KEY,
      license_date TEXT NOT NULL DEFAULT '',
      license_year INTEGER NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_annual_licenses_year ON annual_licenses(license_year);`);

  const row = db.exec(`SELECT id FROM app_settings WHERE id = 1`);
  if (!row.length || !row[0].values.length) {
    db.run(`INSERT INTO app_settings (id) VALUES (1)`);
  }

  migrateSchema();
  fleet.ensureFleetMigrated(db, persistToDisk);
}

function rowToFleetGlobal(columns, values) {
  const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
  return {
    fontSize: row.font_size ?? 'normal',
    displayTheme: row.display_theme ?? 'default',
    boldNumbers: Boolean(row.bold_numbers),
    largeButtons: Boolean(row.large_buttons),
    comfortableReading: Boolean(row.comfortable_reading),
  };
}

function migrateSchema() {
  const settingsInfo = db.exec(`PRAGMA table_info(app_settings)`);
  if (settingsInfo.length) {
    const settingsCols = settingsInfo[0].values.map((row) => row[1]);
    if (!settingsCols.includes('insurance_received_total')) {
      db.run(
        `ALTER TABLE app_settings ADD COLUMN insurance_received_total REAL NOT NULL DEFAULT 0`
      );
    }
    if (!settingsCols.includes('display_theme')) {
      db.run(
        `ALTER TABLE app_settings ADD COLUMN display_theme TEXT NOT NULL DEFAULT 'default'`
      );
    }
    if (!settingsCols.includes('bold_numbers')) {
      db.run(`ALTER TABLE app_settings ADD COLUMN bold_numbers INTEGER NOT NULL DEFAULT 0`);
    }
    if (!settingsCols.includes('large_buttons')) {
      db.run(`ALTER TABLE app_settings ADD COLUMN large_buttons INTEGER NOT NULL DEFAULT 0`);
    }
    if (!settingsCols.includes('comfortable_reading')) {
      db.run(
        `ALTER TABLE app_settings ADD COLUMN comfortable_reading INTEGER NOT NULL DEFAULT 0`
      );
    }
    if (!settingsCols.includes('vehicle_image')) {
      db.run(`ALTER TABLE app_settings ADD COLUMN vehicle_image TEXT NOT NULL DEFAULT ''`);
    }
  }

  const info = db.exec(`PRAGMA table_info(monthly_entries)`);
  if (info.length) {
    const colNames = info[0].values.map((row) => row[1]);
    if (!colNames.includes('expense_accident')) {
      db.run(
        `ALTER TABLE monthly_entries ADD COLUMN expense_accident REAL NOT NULL DEFAULT 0`
      );
    }
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS accidents (
      id TEXT PRIMARY KEY,
      accident_date TEXT NOT NULL,
      responsible_driver TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      cost REAL NOT NULL DEFAULT 0,
      insurance_pending REAL NOT NULL DEFAULT 0,
      insurance_received REAL NOT NULL DEFAULT 0,
      downtime_days INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_accidents_date ON accidents(accident_date);`);

  const accInfo = db.exec(`PRAGMA table_info(accidents)`);
  if (accInfo.length) {
    const accCols = accInfo[0].values.map((row) => row[1]);
    if (!accCols.includes('responsible_driver')) {
      db.run(
        `ALTER TABLE accidents ADD COLUMN responsible_driver TEXT NOT NULL DEFAULT ''`
      );
    }
    if (!accCols.includes('downtime_days')) {
      db.run(`ALTER TABLE accidents ADD COLUMN downtime_days INTEGER NOT NULL DEFAULT 0`);
    }
  }

  const licInfo = db.exec(`PRAGMA table_info(annual_licenses)`);
  if (licInfo.length) {
    const licCols = licInfo[0].values.map((row) => row[1]);
    if (!licCols.includes('license_date')) {
      db.run(`ALTER TABLE annual_licenses ADD COLUMN license_date TEXT NOT NULL DEFAULT ''`);
      db.run(
        `UPDATE annual_licenses SET license_date = printf('%04d-01-01', license_year) WHERE license_date = '' OR license_date IS NULL`
      );
    }
    if (!licCols.includes('notes')) {
      db.run(`ALTER TABLE annual_licenses ADD COLUMN notes TEXT NOT NULL DEFAULT ''`);
    }
  }
}

export async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(databaseFile)) {
    const buffer = fs.readFileSync(databaseFile);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  initSchema();
  persistToDisk();
}

function rowToSettings(columns, values) {
  const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
  return {
    monthlyGuarantee: row.monthly_guarantee,
    currentDriverName: row.current_driver_name,
    vehicleLabel: row.vehicle_label,
    vehicleImage: row.vehicle_image || '',
    vehicleCost: row.vehicle_cost,
    vehicleLifeYears: row.vehicle_life_years,
    fontSize: row.font_size,
    displayTheme: row.display_theme ?? 'default',
    boldNumbers: Boolean(row.bold_numbers),
    largeButtons: Boolean(row.large_buttons),
    comfortableReading: Boolean(row.comfortable_reading),
    insuranceReceivedTotal: row.insurance_received_total ?? 0,
  };
}

function rowToLicense(columns, values) {
  const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
  const year = row.license_year ?? new Date().getFullYear();
  const licenseDate =
    row.license_date && String(row.license_date).length >= 8
      ? row.license_date
      : `${year}-01-01`;
  return {
    id: row.id,
    licenseDate,
    licenseYear: parseInt(String(licenseDate).slice(0, 4), 10) || year,
    amountPaid: row.amount_paid ?? 0,
    notes: row.notes || '',
  };
}

function rowToAccident(columns, values) {
  const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
  return {
    id: row.id,
    accidentDate: row.accident_date,
    responsibleDriver: row.responsible_driver ?? '',
    downtimeDays: row.downtime_days ?? 0,
    details: row.details || '',
    cost: row.cost ?? 0,
    insurancePending: row.insurance_pending ?? 0,
    insuranceReceived: row.insurance_received ?? 0,
  };
}

function rowToEntry(columns, values) {
  const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
  return {
    id: row.id,
    date: row.date,
    month: row.month,
    driverName: row.driver_name,
    revenue: row.revenue,
    expenses: row.expenses,
    expenseDetails: {
      office: row.expense_office,
      insurance: row.expense_insurance,
      oil: row.expense_oil,
      maintenance: row.expense_maintenance,
      accident: row.expense_accident ?? 0,
      commission: row.expense_commission,
      other: row.expense_other,
    },
    notes: row.notes || '',
    driverPaid: row.driver_paid,
    monthlyGuarantee: row.monthly_guarantee ?? undefined,
  };
}

export function getFleet() {
  if (!db) throw new Error('Database not initialized');
  return {
    globalSettings: fleet.getFleetGlobalSettings(db, rowToFleetGlobal),
    vehicles: fleet.listVehicles(db),
  };
}

export function getVehicleState(vehicleId) {
  if (!db) throw new Error('Database not initialized');
  const state = fleet.buildVehicleState(db, vehicleId, {
    rowToSettings: () => ({}),
    rowToEntry,
    rowToAccident,
    rowToLicense,
    getFleetGlobal: (database) => fleet.getFleetGlobalSettings(database, rowToFleetGlobal),
  });
  if (!state) throw new Error('Vehicle not found');
  return state;
}

export function saveVehicleState(vehicleId, state) {
  if (!db) throw new Error('Database not initialized');
  fleet.saveVehicleState(db, vehicleId, state, persistToDisk);
  const global = {
    fontSize: state.settings.fontSize,
    displayTheme: state.settings.displayTheme,
    boldNumbers: state.settings.boldNumbers,
    largeButtons: state.settings.largeButtons,
    comfortableReading: state.settings.comfortableReading,
  };
  fleet.saveFleetGlobalSettings(db, global, persistToDisk);
}

export function createVehicle(payload) {
  if (!db) throw new Error('Database not initialized');
  return fleet.createVehicle(db, payload, persistToDisk);
}

export function deleteVehicle(vehicleId) {
  if (!db) throw new Error('Database not initialized');
  const list = fleet.listVehicles(db);
  if (list.length <= 1) {
    throw new Error('Cannot delete the last vehicle');
  }
  fleet.deleteVehicle(db, vehicleId, persistToDisk);
}

export function saveFleetGlobalSettings(global) {
  if (!db) throw new Error('Database not initialized');
  fleet.saveFleetGlobalSettings(db, global, persistToDisk);
}

/** @deprecated use getVehicleState — returns first/default vehicle */
export function getAppState() {
  if (!db) throw new Error('Database not initialized');
  const vehicles = fleet.listVehicles(db);
  if (vehicles.length > 0) {
    return getVehicleState(vehicles[0].id);
  }

  const settingsRes = db.exec(`SELECT * FROM app_settings WHERE id = 1`);
  const settings =
    settingsRes.length > 0
      ? rowToSettings(settingsRes[0].columns, settingsRes[0].values[0])
      : {
          monthlyGuarantee: 750,
          currentDriverName: '',
          vehicleLabel: 'VIP limousine CARS',
          vehicleCost: 33000,
          vehicleLifeYears: 7,
          fontSize: 'normal',
          displayTheme: 'default',
          boldNumbers: false,
          largeButtons: false,
          comfortableReading: false,
          insuranceReceivedTotal: 0,
        };

  const entriesRes = db.exec(`SELECT * FROM monthly_entries ORDER BY date ASC`);
  const entries =
    entriesRes.length > 0
      ? entriesRes[0].values.map((v) => rowToEntry(entriesRes[0].columns, v))
      : [];

  const accidentsRes = db.exec(`SELECT * FROM accidents ORDER BY accident_date ASC`);
  const accidents =
    accidentsRes.length > 0
      ? accidentsRes[0].values.map((v) => rowToAccident(accidentsRes[0].columns, v))
      : [];

  const licensesRes = db.exec(`SELECT * FROM annual_licenses ORDER BY license_date ASC`);
  const licenses =
    licensesRes.length > 0
      ? licensesRes[0].values.map((v) => rowToLicense(licensesRes[0].columns, v))
      : [];

  return { settings, entries, accidents, licenses };
}

/** @deprecated use saveVehicleState */
export function saveAppState(state) {
  if (!db) throw new Error('Database not initialized');
  let vehicles = fleet.listVehicles(db);
  if (vehicles.length === 0) {
    fleet.createVehicle(db, { label: state.settings?.vehicleLabel || 'VIP limousine CARS' }, persistToDisk);
    vehicles = fleet.listVehicles(db);
  }
  const vehicleId = vehicles[0]?.id ?? fleet.DEFAULT_VEHICLE_ID;
  saveVehicleState(vehicleId, state);
}

export function closeDb() {
  if (db) {
    persistToDisk();
    db.close();
    db = null;
  }
}
