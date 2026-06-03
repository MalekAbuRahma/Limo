/**
 * Multi-vehicle fleet: PostgreSQL CRUD.
 * Each vehicle has isolated entries, accidents, licenses, oil changes.
 */

import { getPool } from './pgPool.js';
import {
  rowToFleetGlobal,
  rowToVehicleMeta,
  rowToEntry,
  rowToAccident,
  rowToLicense,
  rowToOilChange,
} from './rows.js';

function assertVehicleImage(vehicleImage) {
  if (!String(vehicleImage ?? '').trim()) {
    const err = new Error('صورة السيارة إجباري');
    err.code = 'VEHICLE_IMAGE_REQUIRED';
    throw err;
  }
}

export async function getFleetGlobalSettings() {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM fleet_settings WHERE id = 1`);
  return rowToFleetGlobal(rows[0]);
}

export async function saveFleetGlobalSettings(global) {
  const pool = getPool();
  await pool.query(
    `UPDATE fleet_settings SET
      font_size = $1, display_theme = $2, bold_numbers = $3,
      large_buttons = $4, comfortable_reading = $5
    WHERE id = 1`,
    [
      global.fontSize ?? 'normal',
      global.displayTheme ?? 'default',
      Boolean(global.boldNumbers),
      Boolean(global.largeButtons),
      Boolean(global.comfortableReading),
    ]
  );
}

function groupByVehicleId(rows) {
  const map = new Map();
  for (const row of rows) {
    const id = row.vehicle_id;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

/** Fleet garage list — one vehicle query + batched related rows (not N× full state loads). */
export async function listVehicles(actor = null) {
  const pool = getPool();
  const params = [];
  let where = '';
  if (actor && actor.role !== 'admin') {
    where = 'WHERE v.assigned_user_id = $1';
    params.push(actor.id);
  }
  const { rows: vehicles } = await pool.query(
    `SELECT v.*, u.display_name AS assigned_user_display_name, u.username AS assigned_username
     FROM vehicles v
     LEFT JOIN users u ON u.id = v.assigned_user_id
     ${where}
     ORDER BY v.sort_order ASC, v.created_at ASC`,
    params
  );
  if (!vehicles.length) return [];

  const ids = vehicles.map((v) => v.id);
  const [entriesRes, accidentsRes, licensesRes, oilRes] = await Promise.all([
    pool.query(
      `SELECT * FROM monthly_entries WHERE vehicle_id = ANY($1::text[]) ORDER BY date ASC`,
      [ids]
    ),
    pool.query(
      `SELECT * FROM accidents WHERE vehicle_id = ANY($1::text[]) ORDER BY accident_date ASC`,
      [ids]
    ),
    pool.query(
      `SELECT * FROM annual_licenses WHERE vehicle_id = ANY($1::text[]) ORDER BY license_date ASC`,
      [ids]
    ),
    pool.query(
      `SELECT * FROM oil_changes WHERE vehicle_id = ANY($1::text[]) ORDER BY change_date ASC`,
      [ids]
    ),
  ]);

  const entriesByVehicle = groupByVehicleId(entriesRes.rows);
  const accidentsByVehicle = groupByVehicleId(accidentsRes.rows);
  const licensesByVehicle = groupByVehicleId(licensesRes.rows);
  const oilByVehicle = groupByVehicleId(oilRes.rows);

  const { computeFullVehicleTotals } = await import('../utils/taxiVehicleTotals.ts');
  const { computeVehicleCardProperties } = await import('../utils/vehicleGarageCard.ts');

  return vehicles.map((v) => {
    const meta = rowToVehicleMeta(v);
    const guarantee = meta.monthlyGuarantee;
    const entries = (entriesByVehicle.get(meta.id) ?? []).map(rowToEntry);
    const accidents = (accidentsByVehicle.get(meta.id) ?? []).map(rowToAccident);
    const licenses = (licensesByVehicle.get(meta.id) ?? []).map(rowToLicense);
    const oilChanges = (oilByVehicle.get(meta.id) ?? []).map(rowToOilChange);
    const totals = computeFullVehicleTotals(
      entries,
      guarantee,
      accidents,
      licenses,
      oilChanges
    );

    return {
      ...meta,
      entryCount: entries.length,
      totalRevenue: totals.totalRevenue,
      totalExpenses: totals.totalExpenses,
      netProfit: totals.netProfit,
      cardProperties: computeVehicleCardProperties(
        entries,
        guarantee,
        licenses,
        oilChanges
      ),
    };
  });
}

export async function createVehicle({
  label,
  vehicleImage = '',
  ownerName = '',
  monthlyGuarantee = 750,
  currentDriverName = '',
  vehicleCost = 33000,
  vehicleLifeYears = 7,
  insuranceReceivedTotal = 0,
  assignedUserId = null,
}) {
  assertVehicleImage(vehicleImage);
  const pool = getPool();
  const id = `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const sortRes = await pool.query(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM vehicles`
  );
  const sortOrder = Number(sortRes.rows[0]?.next_order ?? 0);
  await pool.query(
    `INSERT INTO vehicles (
      id, label, vehicle_image, owner_name, monthly_guarantee, current_driver_name,
      vehicle_cost, vehicle_life_years, insurance_received_total, sort_order, assigned_user_id, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      id,
      label?.trim() || 'سيارة جديدة',
      vehicleImage || '',
      ownerName?.trim() ?? '',
      monthlyGuarantee ?? 750,
      currentDriverName ?? '',
      vehicleCost ?? 33000,
      vehicleLifeYears ?? 7,
      insuranceReceivedTotal ?? 0,
      sortOrder,
      assignedUserId,
    ]
  );
  return id;
}

export async function updateVehicleAssignment(vehicleId, assignedUserId) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE vehicles SET assigned_user_id = $1 WHERE id = $2`,
    [assignedUserId, vehicleId]
  );
  if (rowCount === 0) {
    const err = new Error('Vehicle not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
}

export async function deleteVehicle(vehicleId) {
  const pool = getPool();
  await pool.query(`DELETE FROM vehicles WHERE id = $1`, [vehicleId]);
}

export async function buildVehicleState(vehicleId) {
  const pool = getPool();
  const { rows: vRows } = await pool.query(`SELECT * FROM vehicles WHERE id = $1`, [vehicleId]);
  if (!vRows.length) return null;

  const v = rowToVehicleMeta(vRows[0]);
  const global = await getFleetGlobalSettings();

  const settings = {
    monthlyGuarantee: v.monthlyGuarantee,
    currentDriverName: v.currentDriverName,
    vehicleLabel: v.label,
    vehicleImage: v.vehicleImage,
    ownerName: v.ownerName,
    vehicleCost: v.vehicleCost,
    vehicleLifeYears: v.vehicleLifeYears,
    insuranceReceivedTotal: v.insuranceReceivedTotal,
    fontSize: global.fontSize,
    displayTheme: global.displayTheme,
    boldNumbers: global.boldNumbers,
    largeButtons: global.largeButtons,
    comfortableReading: global.comfortableReading,
  };

  const { rows: entries } = await pool.query(
    `SELECT * FROM monthly_entries WHERE vehicle_id = $1 ORDER BY date ASC`,
    [vehicleId]
  );
  const { rows: accidents } = await pool.query(
    `SELECT * FROM accidents WHERE vehicle_id = $1 ORDER BY accident_date ASC`,
    [vehicleId]
  );
  const { rows: licenses } = await pool.query(
    `SELECT * FROM annual_licenses WHERE vehicle_id = $1 ORDER BY license_date ASC`,
    [vehicleId]
  );
  const { rows: oilRows } = await pool.query(
    `SELECT * FROM oil_changes WHERE vehicle_id = $1 ORDER BY change_date ASC`,
    [vehicleId]
  );

  return {
    settings,
    entries: entries.map(rowToEntry),
    accidents: accidents.map(rowToAccident),
    licenses: licenses.map(rowToLicense),
    oilChanges: oilRows.map(rowToOilChange),
  };
}

export async function saveVehicleState(vehicleId, state) {
  const pool = getPool();
  const { settings, entries, accidents = [], licenses = [], oilChanges = [] } = state;
  assertVehicleImage(settings?.vehicleImage);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE vehicles SET
        label = $1, vehicle_image = $2, owner_name = $3, monthly_guarantee = $4, current_driver_name = $5,
        vehicle_cost = $6, vehicle_life_years = $7, insurance_received_total = $8
      WHERE id = $9`,
      [
        settings.vehicleLabel ?? '',
        settings.vehicleImage ?? '',
        settings.ownerName ?? '',
        settings.monthlyGuarantee ?? 750,
        settings.currentDriverName ?? '',
        settings.vehicleCost ?? 0,
        settings.vehicleLifeYears ?? 7,
        settings.insuranceReceivedTotal ?? 0,
        vehicleId,
      ]
    );

    await client.query(`DELETE FROM accidents WHERE vehicle_id = $1`, [vehicleId]);
    for (const a of accidents) {
      await client.query(
        `INSERT INTO accidents (
          id, vehicle_id, accident_date, responsible_driver, downtime_days,
          details, cost, insurance_pending, insurance_received
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          a.id,
          vehicleId,
          a.accidentDate,
          a.responsibleDriver ?? '',
          a.downtimeDays ?? 0,
          a.details ?? '',
          a.cost ?? 0,
          a.insurancePending ?? 0,
          a.insuranceReceived ?? 0,
        ]
      );
    }

    await client.query(`DELETE FROM annual_licenses WHERE vehicle_id = $1`, [vehicleId]);
    for (const l of licenses) {
      await client.query(
        `INSERT INTO annual_licenses (id, vehicle_id, license_date, license_year, amount_paid, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          l.id,
          vehicleId,
          l.licenseDate ?? `${l.licenseYear ?? new Date().getFullYear()}-01-01`,
          l.licenseYear ?? new Date().getFullYear(),
          l.amountPaid ?? 0,
          l.notes ?? '',
        ]
      );
    }

    await client.query(`DELETE FROM oil_changes WHERE vehicle_id = $1`, [vehicleId]);
    for (const o of oilChanges) {
      await client.query(
        `INSERT INTO oil_changes (
          id, vehicle_id, entry_id, change_date, cost, oil_type, oil_grade,
          current_odometer, distance_km, next_odometer, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          o.id,
          vehicleId,
          o.entryId ?? '',
          o.changeDate,
          o.cost ?? 0,
          o.oilType ?? '',
          o.oilGrade ?? '',
          o.currentOdometer ?? 0,
          o.distanceKm ?? 0,
          o.nextOdometer ?? 0,
          o.notes ?? '',
        ]
      );
    }

    await client.query(`DELETE FROM monthly_entries WHERE vehicle_id = $1`, [vehicleId]);
    for (const e of entries) {
      const d = e.expenseDetails ?? {};
      await client.query(
        `INSERT INTO monthly_entries (
          id, vehicle_id, date, month, driver_name, revenue, expenses,
          expense_office, expense_insurance, expense_oil, expense_maintenance,
          expense_accident, expense_commission, expense_other, notes, driver_paid,
          driver_payment_1, driver_payment_2, driver_payment_3, monthly_guarantee, payment_complete,
          work_start_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          e.id,
          vehicleId,
          e.date,
          e.month ?? '',
          e.driverName ?? '',
          e.revenue ?? 0,
          e.expenses ?? 0,
          d.office ?? 0,
          d.insurance ?? 0,
          d.oil ?? 0,
          d.maintenance ?? 0,
          d.accident ?? 0,
          d.commission ?? 0,
          d.other ?? 0,
          e.notes ?? '',
          e.driverPaid ?? 0,
          e.driverPayments?.[0] ?? 0,
          e.driverPayments?.[1] ?? 0,
          e.driverPayments?.[2] ?? 0,
          e.monthlyGuarantee ?? null,
          Boolean(e.paymentComplete),
          e.workStartDate ?? '',
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await saveFleetGlobalSettings({
    fontSize: settings.fontSize,
    displayTheme: settings.displayTheme,
    boldNumbers: settings.boldNumbers,
    largeButtons: settings.largeButtons,
    comfortableReading: settings.comfortableReading,
  });
}

export async function getFleet(actor = null) {
  return {
    globalSettings: await getFleetGlobalSettings(),
    vehicles: await listVehicles(actor),
  };
}
