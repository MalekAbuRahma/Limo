import { randomUUID } from 'crypto';
import { getPool } from './pgPool.js';
import { hashPassword, verifyPassword } from './password.js';

const SESSION_DAYS = 30;
export const ROLES = ['admin', 'user'];

function sessionExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

export function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function countUsers() {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM users`);
  return rows[0].c;
}

export async function seedDefaultAdmin() {
  const count = await countUsers();
  if (count > 0) return null;

  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const password = process.env.ADMIN_INITIAL_PASSWORD || 'admin';
  const displayName = process.env.ADMIN_DISPLAY_NAME || 'مدير النظام';

  const pool = getPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, username, password_hash, display_name, role, active)
     VALUES ($1, $2, $3, $4, 'admin', TRUE)`,
    [id, username, hashPassword(password), displayName]
  );
  console.log(`[auth] Seeded default admin user "${username}" — change password after first login`);
  return id;
}

/** Create or update an admin account (used by ENSURE_ADMIN and setup scripts). */
export async function ensureAdminUser({
  username = 'admin',
  password = '1234',
  displayName = 'مدير النظام',
} = {}) {
  const u = String(username || '')
    .trim()
    .toLowerCase();
  if (!u) throw Object.assign(new Error('Username required'), { code: 'INVALID_USERNAME' });
  if (!String(password || '').trim()) {
    throw Object.assign(new Error('Password required'), { code: 'INVALID_PASSWORD' });
  }

  const pool = getPool();
  const hash = hashPassword(password);
  const existing = await findUserByUsername(u);

  if (existing) {
    await pool.query(
      `UPDATE users
       SET password_hash = $1, role = 'admin', active = TRUE,
           display_name = COALESCE(NULLIF($2, ''), display_name), updated_at = NOW()
       WHERE username = $3`,
      [hash, displayName, u]
    );
    console.log(`[auth] Updated admin @${u} (password reset, role=admin)`);
    return existing.id;
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, username, password_hash, display_name, role, active)
     VALUES ($1, $2, $3, $4, 'admin', TRUE)`,
    [id, u, hash, displayName || u]
  );
  console.log(`[auth] Created admin @${u}`);
  return id;
}

export function parseEnsureAdminEnv() {
  const raw = process.env.ENSURE_ADMIN?.trim();
  if (!raw || raw === '0' || raw === 'false') return null;
  if (raw === '1' || raw === 'true') {
    return { username: 'admin', password: '1234', displayName: 'مدير النظام' };
  }
  const colon = raw.indexOf(':');
  if (colon === -1) {
    return { username: raw.toLowerCase(), password: '1234', displayName: 'مدير النظام' };
  }
  return {
    username: raw.slice(0, colon).trim().toLowerCase(),
    password: raw.slice(colon + 1),
    displayName: process.env.ADMIN_DISPLAY_NAME || 'مدير النظام',
  };
}

export async function findUserByUsername(username) {
  const pool = getPool();
  const u = String(username || '')
    .trim()
    .toLowerCase();
  if (!u) return null;
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, display_name, role, active, created_at, updated_at
     FROM users WHERE username = $1`,
    [u]
  );
  return rows[0] ?? null;
}

export async function findUserById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, username, display_name, role, active, created_at, updated_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function login(username, password) {
  const row = await findUserByUsername(username);
  if (!row || !row.active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;

  const token = randomUUID();
  const pool = getPool();
  await pool.query(
    `INSERT INTO auth_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, row.id, sessionExpiry()]
  );

  return {
    token,
    user: rowToUser(row),
  };
}

export async function logout(token) {
  if (!token) return;
  const pool = getPool();
  await pool.query(`DELETE FROM auth_sessions WHERE token = $1`, [token]);
}

export async function validateSession(token) {
  if (!token) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.role, u.active, u.created_at, u.updated_at,
            s.expires_at
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token]
  );
  const row = rows[0];
  if (!row || !row.active) return null;
  if (new Date(row.expires_at) < new Date()) {
    await pool.query(`DELETE FROM auth_sessions WHERE token = $1`, [token]);
    return null;
  }
  return rowToUser(row);
}

export function extractBearerToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const header = req.headers['x-session-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  return null;
}
