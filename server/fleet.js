/**
 * Multi-vehicle fleet: schema, migration, CRUD.
 * Each vehicle has isolated entries, accidents, licenses.
 */

const DEFAULT_VEHICLE_ID = 'vehicle-default';

function tableHasColumn(db, table, column) {
  const info = db.exec(`PRAGMA table_info(${table})`);
  if (!info.length) return false;
  return info[0].values.some((row) => row[1] === column);
}

function ensureColumn(db, table, ddl) {
  const col = ddl.match(/ADD COLUMN (\w+)/i)?.[1];
  if (col && !tableHasColumn(db, table, col)) {
    db.run(ddl);
  }
}

export function ensureFleetMigrated(db, persistToDisk) {
  db.run(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      vehicle_image TEXT NOT NULL DEFAULT '',
      monthly_guarantee REAL NOT NULL DEFAULT 750,
      current_driver_name TEXT NOT NULL DEFAULT '',
      vehicle_cost REAL NOT NULL DEFAULT 33000,
      vehicle_life_years INTEGER NOT NULL DEFAULT 7,
      insurance_received_total REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ''
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fleet_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      font_size TEXT NOT NULL DEFAULT 'normal',
      display_theme TEXT NOT NULL DEFAULT 'default',
      bold_numbers INTEGER NOT NULL DEFAULT 0,
      large_buttons INTEGER NOT NULL DEFAULT 0,
      comfortable_reading INTEGER NOT NULL DEFAULT 0
    );
  `);

  const fleetRow = db.exec(`SELECT id FROM fleet_settings WHERE id = 1`);
  if (!fleetRow.length || !fleetRow[0].values.length) {
    db.run(`INSERT INTO fleet_settings (id) VALUES (1)`);
  }

  ensureColumn(db, 'monthly_entries', `ALTER TABLE monthly_entries ADD COLUMN vehicle_id TEXT`);
  ensureColumn(db, 'accidents', `ALTER TABLE accidents ADD COLUMN vehicle_id TEXT`);
  ensureColumn(db, 'annual_licenses', `ALTER TABLE annual_licenses ADD COLUMN vehicle_id TEXT`);

  db.run(`
    CREATE TABLE IF NOT EXISTS oil_changes (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      entry_id TEXT NOT NULL DEFAULT '',
      change_date TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      current_odometer INTEGER NOT NULL DEFAULT 0,
      distance_km INTEGER NOT NULL DEFAULT 0,
      next_odometer INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_oil_changes_vehicle ON oil_changes(vehicle_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_oil_changes_date ON oil_changes(change_date);`);
  ensureColumn(db, 'oil_changes', `ALTER TABLE oil_changes ADD COLUMN oil_type TEXT NOT NULL DEFAULT ''`);
  ensureColumn(db, 'oil_changes', `ALTER TABLE oil_changes ADD COLUMN oil_grade TEXT NOT NULL DEFAULT ''`);

  const vehicleCount = db.exec(`SELECT COUNT(*) AS c FROM vehicles`);
  const count = vehicleCount[0]?.values[0]?.[0] ?? 0;

  if (count === 0) {
    migrateLegacySingleVehicle(db);
    persistToDisk();
  } else {
    db.run(
      `UPDATE monthly_entries SET vehicle_id = ? WHERE vehicle_id IS NULL OR vehicle_id = ''`,
      [DEFAULT_VEHICLE_ID]
    );
    db.run(
      `UPDATE accidents SET vehicle_id = ? WHERE vehicle_id IS NULL OR vehicle_id = ''`,
      [DEFAULT_VEHICLE_ID]
    );
    db.run(
      `UPDATE annual_licenses SET vehicle_id = ? WHERE vehicle_id IS NULL OR vehicle_id = ''`,
      [DEFAULT_VEHICLE_ID]
    );
  }
}

function migrateLegacySingleVehicle(db) {
  const settingsRes = db.exec(`SELECT * FROM app_settings WHERE id = 1`);
  let label = 'VIP limousine CARS';
  let image = '';
  let guarantee = 750;
  let driver = '';
  let cost = 33000;
  let lifeYears = 7;
  let insuranceTotal = 0;
  let fontSize = 'normal';
  let displayTheme = 'default';
  let boldNumbers = 0;
  let largeButtons = 0;
  let comfortableReading = 0;

  if (settingsRes.length > 0) {
    const row = Object.fromEntries(
      settingsRes[0].columns.map((c, i) => [c, settingsRes[0].values[0][i]])
    );
    label = row.vehicle_label || label;
    image = row.vehicle_image || '';
    guarantee = row.monthly_guarantee ?? guarantee;
    driver = row.current_driver_name || '';
    cost = row.vehicle_cost ?? cost;
    lifeYears = row.vehicle_life_years ?? lifeYears;
    insuranceTotal = row.insurance_received_total ?? 0;
    fontSize = row.font_size || 'normal';
    displayTheme = row.display_theme || 'default';
    boldNumbers = row.bold_numbers ?? 0;
    largeButtons = row.large_buttons ?? 0;
    comfortableReading = row.comfortable_reading ?? 0;
  }

  const now = new Date().toISOString();
  db.run(
    `INSERT INTO vehicles (
      id, label, vehicle_image, monthly_guarantee, current_driver_name,
      vehicle_cost, vehicle_life_years, insurance_received_total, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [DEFAULT_VEHICLE_ID, label, image, guarantee, driver, cost, lifeYears, insuranceTotal, now]
  );

  db.run(
    `UPDATE fleet_settings SET
      font_size = ?, display_theme = ?, bold_numbers = ?, large_buttons = ?, comfortable_reading = ?
    WHERE id = 1`,
    [fontSize, displayTheme, boldNumbers, largeButtons, comfortableReading]
  );

  db.run(`UPDATE monthly_entries SET vehicle_id = ?`, [DEFAULT_VEHICLE_ID]);
  db.run(`UPDATE accidents SET vehicle_id = ?`, [DEFAULT_VEHICLE_ID]);
  db.run(`UPDATE annual_licenses SET vehicle_id = ?`, [DEFAULT_VEHICLE_ID]);
}

export function getFleetGlobalSettings(db, rowToFleetGlobal) {
  const res = db.exec(`SELECT * FROM fleet_settings WHERE id = 1`);
  if (!res.length || !res[0].values.length) {
    return rowToFleetGlobal(
      ['font_size', 'display_theme', 'bold_numbers', 'large_buttons', 'comfortable_reading'],
      ['normal', 'default', 0, 0, 0]
    );
  }
  return rowToFleetGlobal(res[0].columns, res[0].values[0]);
}

export function saveFleetGlobalSettings(db, global, persistToDisk) {
  db.run(
    `UPDATE fleet_settings SET
      font_size = ?, display_theme = ?, bold_numbers = ?, large_buttons = ?, comfortable_reading = ?
    WHERE id = 1`,
    [
      global.fontSize ?? 'normal',
      global.displayTheme ?? 'default',
      global.boldNumbers ? 1 : 0,
      global.largeButtons ? 1 : 0,
      global.comfortableReading ? 1 : 0,
    ]
  );
  persistToDisk();
}

function rowToVehicleMeta(columns, values) {
  const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
  return {
    id: row.id,
    label: row.label || 'سيارة',
    vehicleImage: row.vehicle_image || '',
    monthlyGuarantee: row.monthly_guarantee ?? 750,
    currentDriverName: row.current_driver_name || '',
    vehicleCost: row.vehicle_cost ?? 0,
    vehicleLifeYears: row.vehicle_life_years ?? 7,
    insuranceReceivedTotal: row.insurance_received_total ?? 0,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at || '',
  };
}

function scalar(db, sql) {
  const res = db.exec(sql);
  if (!res.length || !res[0].values.length) return 0;
  return Number(res[0].values[0][0]) || 0;
}

export function listVehicles(db) {
  const res = db.exec(`SELECT * FROM vehicles ORDER BY sort_order ASC, created_at ASC`);
  if (!res.length) return [];

  return res[0].values.map((values) => {
    const meta = rowToVehicleMeta(res[0].columns, values);
    const entryCount = scalar(
      db,
      `SELECT COUNT(*) FROM monthly_entries WHERE vehicle_id = '${meta.id}'`
    );
    const totalRevenue = scalar(
      db,
      `SELECT COALESCE(SUM(revenue), 0) FROM monthly_entries WHERE vehicle_id = '${meta.id}'`
    );
    const monthlyExpenses = scalar(
      db,
      `SELECT COALESCE(SUM(expenses), 0) FROM monthly_entries WHERE vehicle_id = '${meta.id}'`
    );
    const accidentCost = scalar(
      db,
      `SELECT COALESCE(SUM(cost), 0) FROM accidents WHERE vehicle_id = '${meta.id}'`
    );
    const insuranceReceived = scalar(
      db,
      `SELECT COALESCE(SUM(insurance_received), 0) FROM accidents WHERE vehicle_id = '${meta.id}'`
    );
    const licensePaid = scalar(
      db,
      `SELECT COALESCE(SUM(amount_paid), 0) FROM annual_licenses WHERE vehicle_id = '${meta.id}'`
    );
    const baseNet = totalRevenue - monthlyExpenses;
    const netProfit = baseNet - accidentCost + insuranceReceived - licensePaid;
    const totalExpenses = monthlyExpenses + accidentCost + licensePaid;

    return {
      ...meta,
      entryCount,
      totalRevenue,
      totalExpenses,
      netProfit,
    };
  });
}

export function createVehicle(db, { label, vehicleImage }, persistToDisk) {
  const id = `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const sortRes = db.exec(`SELECT COALESCE(MAX(sort_order), -1) + 1 FROM vehicles`);
  const sortOrder = sortRes[0]?.values[0]?.[0] ?? 0;
  db.run(
    `INSERT INTO vehicles (
      id, label, vehicle_image, monthly_guarantee, current_driver_name,
      vehicle_cost, vehicle_life_years, insurance_received_total, sort_order, created_at
    ) VALUES (?, ?, ?, 750, '', 33000, 7, 0, ?, ?)`,
    [id, label?.trim() || 'سيارة جديدة', vehicleImage || '', sortOrder, now]
  );
  persistToDisk();
  return id;
}

export function deleteVehicle(db, vehicleId, persistToDisk) {
  db.run(`DELETE FROM monthly_entries WHERE vehicle_id = ?`, [vehicleId]);
  db.run(`DELETE FROM accidents WHERE vehicle_id = ?`, [vehicleId]);
  db.run(`DELETE FROM annual_licenses WHERE vehicle_id = ?`, [vehicleId]);
  db.run(`DELETE FROM vehicles WHERE id = ?`, [vehicleId]);
  persistToDisk();
}

export function buildVehicleState(
  db,
  vehicleId,
  { rowToSettings, rowToEntry, rowToAccident, rowToLicense, getFleetGlobal }
) {
  const vRes = db.exec(`SELECT * FROM vehicles WHERE id = '${vehicleId}'`);
  if (!vRes.length || !vRes[0].values.length) return null;

  const v = rowToVehicleMeta(vRes[0].columns, vRes[0].values[0]);
  const global = getFleetGlobal(db);

  const settings = {
    monthlyGuarantee: v.monthlyGuarantee,
    currentDriverName: v.currentDriverName,
    vehicleLabel: v.label,
    vehicleImage: v.vehicleImage,
    vehicleCost: v.vehicleCost,
    vehicleLifeYears: v.vehicleLifeYears,
    insuranceReceivedTotal: v.insuranceReceivedTotal,
    fontSize: global.fontSize,
    displayTheme: global.displayTheme,
    boldNumbers: global.boldNumbers,
    largeButtons: global.largeButtons,
    comfortableReading: global.comfortableReading,
  };

  const entriesRes = db.exec(
    `SELECT * FROM monthly_entries WHERE vehicle_id = '${vehicleId}' ORDER BY date ASC`
  );
  const entries =
    entriesRes.length > 0
      ? entriesRes[0].values.map((val) => rowToEntry(entriesRes[0].columns, val))
      : [];

  const accidentsRes = db.exec(
    `SELECT * FROM accidents WHERE vehicle_id = '${vehicleId}' ORDER BY accident_date ASC`
  );
  const accidents =
    accidentsRes.length > 0
      ? accidentsRes[0].values.map((val) => rowToAccident(accidentsRes[0].columns, val))
      : [];

  const licensesRes = db.exec(
    `SELECT * FROM annual_licenses WHERE vehicle_id = '${vehicleId}' ORDER BY license_date ASC`
  );
  const licenses =
    licensesRes.length > 0
      ? licensesRes[0].values.map((val) => rowToLicense(licensesRes[0].columns, val))
      : [];

  const oilRes = db.exec(
    `SELECT * FROM oil_changes WHERE vehicle_id = '${vehicleId}' ORDER BY change_date ASC`
  );
  const oilChanges =
    oilRes.length > 0
      ? oilRes[0].values.map((val) => {
          const row = Object.fromEntries(oilRes[0].columns.map((c, i) => [c, val[i]]));
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
        })
      : [];

  return { settings, entries, accidents, licenses, oilChanges };
}

export function saveVehicleState(db, vehicleId, state, persistToDisk) {
  const { settings, entries, accidents = [], licenses = [], oilChanges = [] } = state;

  db.run(
    `UPDATE vehicles SET
      label = ?, vehicle_image = ?, monthly_guarantee = ?, current_driver_name = ?,
      vehicle_cost = ?, vehicle_life_years = ?, insurance_received_total = ?
    WHERE id = ?`,
    [
      settings.vehicleLabel ?? '',
      settings.vehicleImage ?? '',
      settings.monthlyGuarantee ?? 750,
      settings.currentDriverName ?? '',
      settings.vehicleCost ?? 0,
      settings.vehicleLifeYears ?? 7,
      settings.insuranceReceivedTotal ?? 0,
      vehicleId,
    ]
  );

  db.run(`DELETE FROM accidents WHERE vehicle_id = ?`, [vehicleId]);
  for (const a of accidents) {
    db.run(
      `INSERT INTO accidents (
        id, vehicle_id, accident_date, responsible_driver, downtime_days, details, cost, insurance_pending, insurance_received
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  db.run(`DELETE FROM annual_licenses WHERE vehicle_id = ?`, [vehicleId]);
  for (const l of licenses) {
    db.run(
      `INSERT INTO annual_licenses (id, vehicle_id, license_date, license_year, amount_paid, notes) VALUES (?, ?, ?, ?, ?, ?)`,
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

  db.run(`DELETE FROM oil_changes WHERE vehicle_id = ?`, [vehicleId]);
  for (const o of oilChanges) {
    db.run(
      `INSERT INTO oil_changes (
        id, vehicle_id, entry_id, change_date, cost, oil_type, oil_grade,
        current_odometer, distance_km, next_odometer, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  db.run(`DELETE FROM monthly_entries WHERE vehicle_id = ?`, [vehicleId]);
  for (const e of entries) {
    const d = e.expenseDetails ?? {};
    db.run(
      `INSERT INTO monthly_entries (
        id, vehicle_id, date, month, driver_name, revenue, expenses,
        expense_office, expense_insurance, expense_oil, expense_maintenance,
        expense_accident, expense_commission, expense_other, notes, driver_paid, monthly_guarantee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        e.monthlyGuarantee ?? null,
      ]
    );
  }

  persistToDisk();
}

export { DEFAULT_VEHICLE_ID };
