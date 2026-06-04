import { getPool } from './pgPool.js';
import { seedDefaultAdmin } from './auth.js';

const DEFAULT_VEHICLE_ID = 'vehicle-default';

export async function initSchema() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fleet_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      font_size TEXT NOT NULL DEFAULT 'normal',
      display_theme TEXT NOT NULL DEFAULT 'default',
      bold_numbers BOOLEAN NOT NULL DEFAULT FALSE,
      large_buttons BOOLEAN NOT NULL DEFAULT FALSE,
      comfortable_reading BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      vehicle_image TEXT NOT NULL DEFAULT '',
      monthly_guarantee DOUBLE PRECISION NOT NULL DEFAULT 750,
      current_driver_name TEXT NOT NULL DEFAULT '',
      vehicle_cost DOUBLE PRECISION NOT NULL DEFAULT 33000,
      vehicle_life_years INTEGER NOT NULL DEFAULT 7,
      insurance_received_total DOUBLE PRECISION NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS monthly_entries (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      month TEXT NOT NULL DEFAULT '',
      driver_name TEXT NOT NULL DEFAULT '',
      revenue DOUBLE PRECISION NOT NULL DEFAULT 0,
      expenses DOUBLE PRECISION NOT NULL DEFAULT 0,
      expense_office DOUBLE PRECISION NOT NULL DEFAULT 0,
      expense_insurance DOUBLE PRECISION NOT NULL DEFAULT 0,
      expense_oil DOUBLE PRECISION NOT NULL DEFAULT 0,
      expense_maintenance DOUBLE PRECISION NOT NULL DEFAULT 0,
      expense_accident DOUBLE PRECISION NOT NULL DEFAULT 0,
      expense_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
      expense_other DOUBLE PRECISION NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      driver_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
      monthly_guarantee DOUBLE PRECISION
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_monthly_entries_vehicle ON monthly_entries(vehicle_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_monthly_entries_date ON monthly_entries(date);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS accidents (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      accident_date TEXT NOT NULL,
      responsible_driver TEXT NOT NULL DEFAULT '',
      downtime_days INTEGER NOT NULL DEFAULT 0,
      details TEXT NOT NULL DEFAULT '',
      cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      insurance_pending DOUBLE PRECISION NOT NULL DEFAULT 0,
      insurance_received DOUBLE PRECISION NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_accidents_vehicle ON accidents(vehicle_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annual_licenses (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      license_date TEXT NOT NULL DEFAULT '',
      license_year INTEGER NOT NULL,
      amount_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_annual_licenses_vehicle ON annual_licenses(vehicle_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS oil_changes (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL DEFAULT '',
      change_date TEXT NOT NULL,
      cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      oil_type TEXT NOT NULL DEFAULT '',
      oil_grade TEXT NOT NULL DEFAULT '',
      current_odometer INTEGER NOT NULL DEFAULT 0,
      distance_km INTEGER NOT NULL DEFAULT 0,
      next_odometer INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_oil_changes_vehicle ON oil_changes(vehicle_id);
  `);

  await pool.query(`
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE monthly_entries ADD COLUMN IF NOT EXISTS driver_payment_1 DOUBLE PRECISION NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE monthly_entries ADD COLUMN IF NOT EXISTS driver_payment_2 DOUBLE PRECISION NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE monthly_entries ADD COLUMN IF NOT EXISTS driver_payment_3 DOUBLE PRECISION NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE monthly_entries ADD COLUMN IF NOT EXISTS payment_complete BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE monthly_entries ADD COLUMN IF NOT EXISTS work_start_date TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS driver_first_payment_date TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS driver_payment_mode TEXT NOT NULL DEFAULT 'advance';
  `);
  await pool.query(`
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS payment_cycle_epoch INTEGER NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE monthly_entries ADD COLUMN IF NOT EXISTS payment_anchor_date TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE monthly_entries ADD COLUMN IF NOT EXISTS payment_cycle_epoch INTEGER NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deletion_requests (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      request_type TEXT NOT NULL CHECK (request_type IN (
        'entry', 'oil_change', 'accident', 'license', 'vehicle', 'clear_all_entries'
      )),
      target_id TEXT,
      summary TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      requested_by TEXT NOT NULL REFERENCES users(id),
      reviewed_by TEXT REFERENCES users(id),
      review_note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests(status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_deletion_requests_vehicle ON deletion_requests(vehicle_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_deletion_requests_requested_by ON deletion_requests(requested_by);
  `);

  await pool.query(`
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_vehicles_assigned_user ON vehicles(assigned_user_id);
  `);

  await pool.query(`
    INSERT INTO fleet_settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);

  await seedDefaultAdmin();

  // Legacy cars without assignee — attach to first admin so data stays visible until reassigned
  await pool.query(`
    UPDATE vehicles SET assigned_user_id = (
      SELECT id FROM users WHERE role = 'admin' AND active = TRUE ORDER BY created_at ASC LIMIT 1
    )
    WHERE assigned_user_id IS NULL
      AND EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND active = TRUE)
  `);

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM vehicles`);
  if (rows[0].c === 0) {
    await pool.query(
      `INSERT INTO vehicles (
        id, label, vehicle_image, monthly_guarantee, current_driver_name,
        vehicle_cost, vehicle_life_years, insurance_received_total, sort_order, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, NOW())`,
      [
        DEFAULT_VEHICLE_ID,
        'VIP limousine CARS',
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQADAPwA/9k=',
        750,
        '',
        33000,
        7,
        0,
      ]
    );
  }
}

export { DEFAULT_VEHICLE_ID };
