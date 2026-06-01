import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) throw new Error('Database pool not initialized');
  return pool;
}

export function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/vip_limousine_cars'
  );
}

/** Safe label for logs (hides password) */
export function getDatabaseLabel() {
  try {
    const u = new URL(getDatabaseUrl());
    return `${u.protocol}//${u.username}@${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return 'postgresql://****';
  }
}

export async function initPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 10,
  });
  await pool.query('SELECT 1');
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
