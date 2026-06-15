/**
 * Server-side driver ledger operations.
 *
 * Handles F1 (running balance), F2 (withdrawal/handoff),
 * F3 (automated replacement), F4 (audit), F7 (active driver validation).
 */

import { randomUUID } from 'crypto';
import { getPool } from './pgPool.js';
import {
  rowToDriverProfile,
  rowToDriverAssignment,
  rowToAuditLog,
} from './rows.js';

// ─── Audit Logging ────────────────────────────────────────────────────────────

export async function writeAuditLog({ entityType, entityId, actionType, oldValue, newValue, performedBy }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO audit_log (id, entity_type, entity_id, action_type, old_value, new_value, performed_by, performed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      randomUUID(),
      entityType,
      entityId,
      actionType,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      performedBy || null,
    ]
  );
}

export async function listAuditLog({ entityType, entityId, limit = 100, offset = 0 } = {}) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (entityType) {
    params.push(entityType);
    conditions.push(`entity_type = $${params.length}`);
  }
  if (entityId) {
    params.push(entityId);
    conditions.push(`entity_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM audit_log ${where} ORDER BY performed_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows.map(rowToAuditLog);
}

// ─── Driver Profile CRUD ─────────────────────────────────────────────────────

export async function getDriverProfile(driverId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM vehicle_drivers WHERE id = $1`,
    [driverId]
  );
  return rows[0] ? rowToDriverProfile(rows[0]) : null;
}

export async function updateDriverProfile(driverId, updates, performedBy) {
  const pool = getPool();
  const old = await getDriverProfile(driverId);
  if (!old) throw new Error(`Driver ${driverId} not found`);

  const fields = [];
  const params = [];

  const allowed = ['phone_number', 'national_id', 'emergency_contact', 'driver_notes', 'notes'];
  const mapping = {
    phoneNumber: 'phone_number',
    nationalId: 'national_id',
    emergencyContact: 'emergency_contact',
    driverNotes: 'driver_notes',
    notes: 'notes',
  };

  for (const [key, col] of Object.entries(mapping)) {
    if (updates[key] !== undefined) {
      params.push(updates[key]);
      fields.push(`${col} = $${params.length}`);
    }
  }

  if (fields.length === 0) return old;

  params.push(performedBy || null, driverId);
  fields.push(`updated_by = $${params.length - 1}`, `updated_at = NOW()`);

  await pool.query(
    `UPDATE vehicle_drivers SET ${fields.join(', ')} WHERE id = $${params.length}`,
    params
  );

  const updated = await getDriverProfile(driverId);
  await writeAuditLog({
    entityType: 'driver',
    entityId: driverId,
    actionType: 'driver_updated',
    oldValue: old,
    newValue: updated,
    performedBy,
  });

  return updated;
}

// ─── F7: Active Driver Validation ────────────────────────────────────────────

export async function getActiveDriver(vehicleId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM vehicle_drivers WHERE vehicle_id = $1 AND end_date IS NULL LIMIT 1`,
    [vehicleId]
  );
  return rows[0] ? rowToDriverProfile(rows[0]) : null;
}

export async function assertNoActiveDriver(vehicleId) {
  const active = await getActiveDriver(vehicleId);
  if (active) {
    throw Object.assign(
      new Error(`Vehicle ${vehicleId} already has an active driver: ${active.name}`),
      { status: 409, activeDriver: active }
    );
  }
}

// ─── Running Balance ──────────────────────────────────────────────────────────

/**
 * Calculate a driver's current outstanding balance from their full monthly
 * entry history for the given vehicle (or all vehicles).
 *
 * Formula: openingBalance + guaranteeDue - paymentsReceived = closingBalance
 */
export async function calculateDriverRunningBalance(driverId, vehicleId = null) {
  const pool = getPool();

  const params = [driverId];
  let vehicleFilter = '';
  if (vehicleId) {
    params.push(vehicleId);
    vehicleFilter = `AND me.vehicle_id = $${params.length}`;
  }

  // Pull all monthly entries where this driver is the named driver, sorted by date
  const { rows } = await pool.query(
    `SELECT me.id, me.date, me.month, me.driver_paid, me.monthly_guarantee,
            me.previous_balance_carried_forward, me.current_guarantee_due, me.total_outstanding_balance,
            v.label AS vehicle_label, me.vehicle_id
     FROM monthly_entries me
     JOIN vehicles v ON v.id = me.vehicle_id
     WHERE me.driver_name = (SELECT name FROM vehicle_drivers WHERE id = $1 LIMIT 1)
     ${vehicleFilter}
     ORDER BY me.date ASC`,
    params
  );

  // Also include driver assignment entries if available
  const { rows: assignmentRows } = await pool.query(
    `SELECT dae.*, v.label AS vehicle_label
     FROM driver_assignment_entries dae
     JOIN vehicles v ON v.id = dae.vehicle_id
     WHERE dae.driver_id = $1
     ORDER BY dae.start_date ASC`,
    [driverId]
  );

  // If we have explicit assignment entries, use those (more accurate for mid-month splits)
  if (assignmentRows.length > 0) {
    let runningBalance = 0;
    const ledger = [];
    for (const row of assignmentRows) {
      const openingBalance = runningBalance;
      const guaranteeDue = Number(row.prorated_guarantee ?? 0);
      const paymentsReceived = Number(row.payments_received ?? 0);
      const closingBalance = openingBalance + guaranteeDue - paymentsReceived;
      ledger.push({
        month: row.start_date?.slice(0, 7) ?? '',
        vehicleId: row.vehicle_id,
        vehicleLabel: row.vehicle_label ?? '',
        openingBalance,
        guaranteeDue,
        paymentsReceived,
        closingBalance,
      });
      runningBalance = closingBalance;
    }
    return {
      driverId,
      currentOutstandingBalance: Math.max(0, runningBalance),
      ledger,
    };
  }

  // Fallback: derive from monthly_entries by driver name
  let runningBalance = 0;
  const ledger = [];
  for (const row of rows) {
    const openingBalance = runningBalance;
    const guaranteeDue = Number(row.monthly_guarantee ?? 750);
    const paymentsReceived = Number(row.driver_paid ?? 0);
    const closingBalance = openingBalance + guaranteeDue - paymentsReceived;
    ledger.push({
      month: row.month || row.date?.slice(0, 7),
      vehicleId: row.vehicle_id,
      vehicleLabel: row.vehicle_label ?? '',
      openingBalance,
      guaranteeDue,
      paymentsReceived,
      closingBalance,
    });
    runningBalance = closingBalance;
  }

  return {
    driverId,
    currentOutstandingBalance: Math.max(0, runningBalance),
    ledger,
  };
}

// ─── F2: Driver Withdrawal & Handoff ─────────────────────────────────────────

const DAYS_IN_MONTH = 30;

function dailyRate(monthlyGuarantee) {
  return Math.round(monthlyGuarantee / DAYS_IN_MONTH);
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function daysBetweenInclusive(startDate, endDate) {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

/**
 * Withdraw a driver mid-month.
 *
 * Steps:
 * 1. Calculate days worked and prorated guarantee.
 * 2. Set end_date on vehicle_drivers record.
 * 3. Create a driver_assignment_entries record freezing the financials.
 * 4. Update current_outstanding_balance on the driver profile.
 * 5. Write audit log.
 * 6. Return suggested next anchor date.
 */
export async function handleDriverWithdrawal({ vehicleId, driverId, endDate, monthlyGuarantee, performedBy }) {
  const pool = getPool();

  const driver = await getDriverProfile(driverId);
  if (!driver) throw new Error(`Driver ${driverId} not found`);
  if (driver.vehicleId !== vehicleId) throw new Error('Driver does not belong to this vehicle');

  const startDate = driver.startDate;
  const daysWorked = daysBetweenInclusive(startDate, endDate);
  const rate = dailyRate(monthlyGuarantee);
  const proratedGuarantee = daysWorked * rate;
  const previousBalance = driver.currentOutstandingBalance;

  // Get payments received for this driver since their start
  const { rows: entryRows } = await pool.query(
    `SELECT COALESCE(SUM(driver_paid), 0) AS total_paid
     FROM monthly_entries
     WHERE vehicle_id = $1 AND driver_name = $2 AND date >= $3`,
    [vehicleId, driver.name, startDate]
  );
  const paymentsReceived = Number(entryRows[0]?.total_paid ?? 0);
  const remainingBalance = Math.max(0, previousBalance + proratedGuarantee - paymentsReceived);

  // Build suggested next anchor date (avoid UTC conversion issues)
  const suggestedNextAnchorDate = addDaysToDateStr(endDate, 1);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Close driver assignment
    await client.query(
      `UPDATE vehicle_drivers SET end_date = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3`,
      [endDate, performedBy || null, driverId]
    );

    // Create frozen assignment entry
    const assignmentId = randomUUID();
    await client.query(
      `INSERT INTO driver_assignment_entries
         (id, vehicle_id, driver_id, start_date, end_date, days_worked, prorated_guarantee,
          previous_balance_carried_forward, payments_received, remaining_balance, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11)`,
      [
        assignmentId, vehicleId, driverId, startDate, endDate, daysWorked,
        proratedGuarantee, previousBalance, paymentsReceived, remainingBalance,
        performedBy || null,
      ]
    );

    // Update driver's running outstanding balance
    await client.query(
      `UPDATE vehicle_drivers SET current_outstanding_balance = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3`,
      [remainingBalance, performedBy || null, driverId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await writeAuditLog({
    entityType: 'driver',
    entityId: driverId,
    actionType: 'driver_withdrawn',
    oldValue: { startDate, previousBalance },
    newValue: { endDate, daysWorked, proratedGuarantee, remainingBalance },
    performedBy,
  });

  return {
    driverId,
    endDate,
    daysWorked,
    dailyRate: rate,
    proratedGuarantee,
    previousBalance,
    paymentsReceived,
    remainingBalance,
    suggestedNextAnchorDate,
  };
}

// ─── F3: Automated Driver Replacement ────────────────────────────────────────

/**
 * Replace the current driver with a new one.
 *
 * Steps:
 * 1. Withdraw existing driver (if present) using endDate.
 * 2. Create new vehicle_drivers record.
 * 3. Increment paymentCycleEpoch on the vehicle.
 * 4. Return suggested payment anchor for new driver.
 */
export async function replaceDriver({
  vehicleId,
  currentDriverId,
  currentDriverEndDate,
  newDriverName,
  newDriverStartDate,
  monthlyGuarantee,
  performedBy,
}) {
  const pool = getPool();

  let withdrawalResult = null;

  // Withdraw current driver if one is active
  if (currentDriverId) {
    withdrawalResult = await handleDriverWithdrawal({
      vehicleId,
      driverId: currentDriverId,
      endDate: currentDriverEndDate,
      monthlyGuarantee,
      performedBy,
    });
  }

  const suggestedAnchor = withdrawalResult?.suggestedNextAnchorDate ?? newDriverStartDate;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create new driver record
    const newDriverId = randomUUID();
    await client.query(
      `INSERT INTO vehicle_drivers (id, vehicle_id, name, start_date, notes, created_by, created_at)
       VALUES ($1, $2, $3, $4, '', $5, NOW())`,
      [newDriverId, vehicleId, newDriverName, newDriverStartDate, performedBy || null]
    );

    // Update vehicle current_driver_name and bump epoch
    await client.query(
      `UPDATE vehicles
       SET current_driver_name = $1,
           payment_cycle_epoch = payment_cycle_epoch + 1,
           driver_first_payment_date = $2,
           updated_by = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [newDriverName, suggestedAnchor, performedBy || null, vehicleId]
    );

    await client.query('COMMIT');

    await writeAuditLog({
      entityType: 'vehicle',
      entityId: vehicleId,
      actionType: 'driver_replaced',
      oldValue: { driverId: currentDriverId, endDate: currentDriverEndDate },
      newValue: { newDriverId, newDriverName, newDriverStartDate, suggestedAnchor },
      performedBy,
    });

    return {
      newDriverId,
      newDriverName,
      newDriverStartDate,
      suggestedAnchor,
      previousDriverResult: withdrawalResult,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── F6: Driver Settlement ────────────────────────────────────────────────────

export async function getDriverSettlement(vehicleId, driverId) {
  const pool = getPool();

  const driver = await getDriverProfile(driverId);
  if (!driver) throw new Error(`Driver ${driverId} not found`);

  const { rows: vehicleRows } = await pool.query(
    `SELECT label, monthly_guarantee FROM vehicles WHERE id = $1`,
    [vehicleId]
  );
  const vehicle = vehicleRows[0];

  // Get all monthly entries for this driver on this vehicle
  const { rows: entryRows } = await pool.query(
    `SELECT id, date, month, driver_paid, monthly_guarantee, driver_payment_1, driver_payment_2, driver_payment_3
     FROM monthly_entries
     WHERE vehicle_id = $1 AND driver_name = $2
     ORDER BY date ASC`,
    [vehicleId, driver.name]
  );

  const defaultGuarantee = Number(vehicle?.monthly_guarantee ?? 750);
  let runningBalance = 0;
  let totalAmountPaid = 0;
  const paymentHistory = [];

  for (const row of entryRows) {
    const guarantee = Number(row.monthly_guarantee ?? defaultGuarantee);
    const paid = Number(row.driver_paid ?? 0);
    runningBalance = runningBalance + guarantee - paid;
    totalAmountPaid += paid;

    // Individual payment slots
    const slots = [
      Number(row.driver_payment_1 ?? 0),
      Number(row.driver_payment_2 ?? 0),
      Number(row.driver_payment_3 ?? 0),
    ];
    for (const amount of slots) {
      if (amount > 0) {
        paymentHistory.push({
          date: row.date,
          amount,
          month: row.month || row.date.slice(0, 7),
          entryId: row.id,
        });
      }
    }
  }

  const totalOutstanding = Math.max(0, runningBalance);
  const currentMonthRemaining = entryRows.length > 0
    ? Math.max(0, Number(entryRows[entryRows.length - 1].monthly_guarantee ?? defaultGuarantee) - Number(entryRows[entryRows.length - 1].driver_paid ?? 0))
    : 0;

  const previousBalance = totalOutstanding - currentMonthRemaining;

  return {
    driver,
    vehicleLabel: vehicle?.label ?? vehicleId,
    monthlyGuarantee: defaultGuarantee,
    amountPaid: totalAmountPaid,
    currentMonthRemaining,
    previousBalance: Math.max(0, previousBalance),
    totalOutstanding,
    paymentHistory,
    currentStatus: driver.endDate ? 'withdrawn' : (totalOutstanding <= 0 ? 'settled' : 'active'),
  };
}

// ─── Driver Assignment Entries ────────────────────────────────────────────────

export async function listDriverAssignments(vehicleId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT dae.*, vd.name AS driver_name
     FROM driver_assignment_entries dae
     JOIN vehicle_drivers vd ON vd.id = dae.driver_id
     WHERE dae.vehicle_id = $1
     ORDER BY dae.start_date ASC`,
    [vehicleId]
  );
  return rows.map(rowToDriverAssignment);
}

export async function getDriverAssignment(assignmentId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT dae.*, vd.name AS driver_name
     FROM driver_assignment_entries dae
     JOIN vehicle_drivers vd ON vd.id = dae.driver_id
     WHERE dae.id = $1`,
    [assignmentId]
  );
  return rows[0] ? rowToDriverAssignment(rows[0]) : null;
}

// ─── F8: Fleet Performance Ranking ───────────────────────────────────────────

export async function getFleetPerformanceRanking(userId = null, role = null) {
  const pool = getPool();

  let vehicleFilter = '';
  const params = [];
  if (role !== 'admin' && userId) {
    params.push(userId);
    vehicleFilter = `WHERE v.assigned_user_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT
       v.id AS vehicle_id,
       v.label AS vehicle_label,
       COALESCE(SUM(me.driver_paid), 0) AS total_owner_income,
       COALESCE(SUM(
         me.expense_office + me.expense_insurance + me.expense_oil +
         me.expense_maintenance + me.expense_accident + me.expense_commission + me.expense_other
       ), 0) AS total_expenses,
       COALESCE(SUM(me.driver_paid), 0) - COALESCE(SUM(
         me.expense_office + me.expense_insurance + me.expense_oil +
         me.expense_maintenance + me.expense_accident + me.expense_commission + me.expense_other
       ), 0) AS net_profit,
       COALESCE(SUM(me.revenue), 0) AS total_revenue
     FROM vehicles v
     LEFT JOIN monthly_entries me ON me.vehicle_id = v.id
     ${vehicleFilter}
     GROUP BY v.id, v.label
     ORDER BY v.label ASC`,
    params
  );

  const toRanked = (arr) =>
    arr.map((v, i) => ({ vehicleId: v.vehicle_id, vehicleLabel: v.vehicle_label, value: v.value, rank: i + 1 }));

  const byNetProfit = [...rows].sort((a, b) => Number(b.net_profit) - Number(a.net_profit));
  const byRevenue = [...rows].sort((a, b) => Number(b.total_revenue) - Number(a.total_revenue));
  const byExpense = [...rows].sort((a, b) => Number(b.total_expenses) - Number(a.total_expenses));

  return {
    bestPerforming: toRanked(byNetProfit.slice(0, 5).map((r) => ({ ...r, value: Number(r.net_profit) }))),
    worstPerforming: toRanked(byNetProfit.slice(-5).reverse().map((r) => ({ ...r, value: Number(r.net_profit) }))),
    highestRevenue: toRanked(byRevenue.slice(0, 5).map((r) => ({ ...r, value: Number(r.total_revenue) }))),
    highestExpense: toRanked(byExpense.slice(0, 5).map((r) => ({ ...r, value: Number(r.total_expenses) }))),
  };
}
