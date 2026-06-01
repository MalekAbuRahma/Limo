/**
 * One-time migration: SQLite data/taxi.db → PostgreSQL (DATABASE_URL)
 * Run: npm run db:migrate
 * Requires: npm install (sql.js is a devDependency for this script only)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import 'dotenv/config';
import { initDb, closeDb, saveVehicleState, getFleet } from '../server/db.js';
import { getPool } from '../server/pgPool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'taxi.db');

function sqlRows(db, sql) {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

function mapEntry(row) {
  return {
    id: row.id,
    date: row.date,
    month: row.month,
    driverName: row.driver_name,
    revenue: row.revenue ?? 0,
    expenses: row.expenses ?? 0,
    expenseDetails: {
      office: row.expense_office ?? 0,
      insurance: row.expense_insurance ?? 0,
      oil: row.expense_oil ?? 0,
      maintenance: row.expense_maintenance ?? 0,
      accident: row.expense_accident ?? 0,
      commission: row.expense_commission ?? 0,
      other: row.expense_other ?? 0,
    },
    notes: row.notes || '',
    driverPaid: row.driver_paid ?? 0,
    monthlyGuarantee: row.monthly_guarantee ?? undefined,
  };
}

function mapAccident(row) {
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

function mapLicense(row) {
  return {
    id: row.id,
    licenseDate: row.license_date || `${row.license_year}-01-01`,
    licenseYear: row.license_year,
    amountPaid: row.amount_paid ?? 0,
    notes: row.notes || '',
  };
}

function mapOil(row) {
  return {
    id: row.id,
    entryId: row.entry_id || '',
    changeDate: row.change_date,
    cost: row.cost ?? 0,
    oilType: row.oil_type || '',
    oilGrade: row.oil_grade || '',
    currentOdometer: row.current_odometer ?? 0,
    distanceKm: row.distance_km ?? 0,
    nextOdometer: row.next_odometer ?? 0,
    notes: row.notes || '',
  };
}

async function main() {
  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite file not found: ${sqlitePath}`);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(sqlitePath);
  const sqlite = new SQL.Database(buffer);

  await initDb();
  const pool = getPool();

  const vehicles = sqlRows(sqlite, `SELECT * FROM vehicles ORDER BY sort_order, created_at`);
  if (vehicles.length === 0) {
    console.log('No vehicles table in SQLite — trying legacy app_settings...');
    const settings = sqlRows(sqlite, `SELECT * FROM app_settings WHERE id = 1`)[0];
    const vid = 'vehicle-default';
    await pool.query(`DELETE FROM vehicles WHERE id = $1`, [vid]);
    await pool.query(
      `INSERT INTO vehicles (
        id, label, vehicle_image, monthly_guarantee, current_driver_name,
        vehicle_cost, vehicle_life_years, insurance_received_total, sort_order, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,NOW())`,
      [
        vid,
        settings?.vehicle_label ?? 'VIP limousine CARS',
        settings?.vehicle_image ?? '',
        settings?.monthly_guarantee ?? 750,
        settings?.current_driver_name ?? '',
        settings?.vehicle_cost ?? 33000,
        settings?.vehicle_life_years ?? 7,
        settings?.insurance_received_total ?? 0,
      ]
    );
    await saveVehicleState(vid, {
      settings: {
        monthlyGuarantee: settings?.monthly_guarantee ?? 750,
        currentDriverName: settings?.current_driver_name ?? '',
        vehicleLabel: settings?.vehicle_label ?? 'VIP limousine CARS',
        vehicleImage: settings?.vehicle_image ?? '',
        vehicleCost: settings?.vehicle_cost ?? 33000,
        vehicleLifeYears: settings?.vehicle_life_years ?? 7,
        fontSize: settings?.font_size ?? 'normal',
        displayTheme: settings?.display_theme ?? 'default',
        boldNumbers: Boolean(settings?.bold_numbers),
        largeButtons: Boolean(settings?.large_buttons),
        comfortableReading: Boolean(settings?.comfortable_reading),
        insuranceReceivedTotal: settings?.insurance_received_total ?? 0,
      },
      entries: sqlRows(sqlite, `SELECT * FROM monthly_entries ORDER BY date`).map(mapEntry),
      accidents: sqlRows(sqlite, `SELECT * FROM accidents ORDER BY accident_date`).map(mapAccident),
      licenses: sqlRows(sqlite, `SELECT * FROM annual_licenses ORDER BY license_date`).map(mapLicense),
      oilChanges: sqlRows(sqlite, `SELECT * FROM oil_changes ORDER BY change_date`).map(mapOil),
    });
    console.log('Migrated legacy single-vehicle data.');
  } else {
    for (const v of vehicles) {
      const vid = v.id;
      const entries = sqlRows(
        sqlite,
        `SELECT * FROM monthly_entries WHERE vehicle_id = '${vid}' OR vehicle_id IS NULL ORDER BY date`
      ).map(mapEntry);
      const accidents = sqlRows(
        sqlite,
        `SELECT * FROM accidents WHERE vehicle_id = '${vid}' OR vehicle_id IS NULL ORDER BY accident_date`
      ).map(mapAccident);
      const licenses = sqlRows(
        sqlite,
        `SELECT * FROM annual_licenses WHERE vehicle_id = '${vid}' OR vehicle_id IS NULL ORDER BY license_date`
      ).map(mapLicense);
      const oilChanges = sqlRows(
        sqlite,
        `SELECT * FROM oil_changes WHERE vehicle_id = '${vid}' ORDER BY change_date`
      ).map(mapOil);

      await pool.query(`DELETE FROM vehicles WHERE id = $1`, [vid]);
      await pool.query(
        `INSERT INTO vehicles (
          id, label, vehicle_image, monthly_guarantee, current_driver_name,
          vehicle_cost, vehicle_life_years, insurance_received_total, sort_order, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          vid,
          v.label,
          v.vehicle_image ?? '',
          v.monthly_guarantee ?? 750,
          v.current_driver_name ?? '',
          v.vehicle_cost ?? 33000,
          v.vehicle_life_years ?? 7,
          v.insurance_received_total ?? 0,
          v.sort_order ?? 0,
          v.created_at || new Date().toISOString(),
        ]
      );

      await saveVehicleState(vid, {
        settings: {
          monthlyGuarantee: v.monthly_guarantee ?? 750,
          currentDriverName: v.current_driver_name ?? '',
          vehicleLabel: v.label ?? '',
          vehicleImage: v.vehicle_image ?? '',
          vehicleCost: v.vehicle_cost ?? 33000,
          vehicleLifeYears: v.vehicle_life_years ?? 7,
          insuranceReceivedTotal: v.insurance_received_total ?? 0,
          fontSize: 'normal',
          displayTheme: 'default',
          boldNumbers: false,
          largeButtons: false,
          comfortableReading: false,
        },
        entries,
        accidents,
        licenses,
        oilChanges,
      });
      console.log(`Migrated vehicle: ${v.label} (${entries.length} months)`);
    }

    const fleetSettings = sqlRows(sqlite, `SELECT * FROM fleet_settings WHERE id = 1`)[0];
    if (fleetSettings) {
      await pool.query(
        `UPDATE fleet_settings SET font_size=$1, display_theme=$2, bold_numbers=$3, large_buttons=$4, comfortable_reading=$5 WHERE id=1`,
        [
          fleetSettings.font_size ?? 'normal',
          fleetSettings.display_theme ?? 'default',
          Boolean(fleetSettings.bold_numbers),
          Boolean(fleetSettings.large_buttons),
          Boolean(fleetSettings.comfortable_reading),
        ]
      );
    }
  }

  const fleet = await getFleet();
  console.log(`\nDone. PostgreSQL now has ${fleet.vehicles.length} vehicle(s).`);
  sqlite.close();
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
