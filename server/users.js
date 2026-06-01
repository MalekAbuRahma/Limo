import { randomUUID } from 'crypto';
import { getPool } from './pgPool.js';
import { hashPassword } from './password.js';
import { findUserByUsername, ROLES, rowToUser } from './auth.js';

function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase();
}

export async function listUsers() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, username, display_name, role, active, created_at, updated_at
     FROM users ORDER BY role DESC, username ASC`
  );
  return rows.map(rowToUser);
}

/** Active users for vehicle assignment dropdown */
export async function listAssignableUsers(actor) {
  const pool = getPool();
  if (actor?.role === 'admin') {
    const { rows } = await pool.query(
      `SELECT id, username, display_name, role
       FROM users WHERE active = TRUE ORDER BY display_name ASC, username ASC`
    );
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      role: r.role,
    }));
  }
  if (!actor?.id) return [];
  const { rows } = await pool.query(
    `SELECT id, username, display_name, role
     FROM users WHERE id = $1 AND active = TRUE`,
    [actor.id]
  );
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
  }));
}

export async function createUser({ username, password, displayName, role }) {
  const u = normalizeUsername(username);
  if (!u || u.length < 2) throw Object.assign(new Error('Username too short'), { code: 'INVALID_USERNAME' });
  if (!password || password.length < 4) {
    throw Object.assign(new Error('Password must be at least 4 characters'), { code: 'INVALID_PASSWORD' });
  }
  const r = ROLES.includes(role) ? role : 'user';
  const name = String(displayName || u).trim() || u;

  const pool = getPool();
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO users (id, username, password_hash, display_name, role, active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [id, u, hashPassword(password), name, r]
    );
  } catch (err) {
    if (err?.code === '23505') {
      throw Object.assign(new Error('Username already exists'), { code: 'USERNAME_TAKEN' });
    }
    throw err;
  }
  return findUserPublic(id);
}

async function findUserPublic(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, username, display_name, role, active, created_at, updated_at FROM users WHERE id = $1`,
    [id]
  );
  return rowToUser(rows[0]);
}

export async function updateUser(id, patch) {
  const existing = await findUserPublic(id);
  if (!existing) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

  const pool = getPool();
  const updates = [];
  const values = [];
  let i = 1;

  if (patch.displayName !== undefined) {
    const name = String(patch.displayName).trim();
    if (!name) throw Object.assign(new Error('Display name required'), { code: 'INVALID_DISPLAY_NAME' });
    updates.push(`display_name = $${i++}`);
    values.push(name);
  }

  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) {
      throw Object.assign(new Error('Invalid role'), { code: 'INVALID_ROLE' });
    }
    updates.push(`role = $${i++}`);
    values.push(patch.role);
  }

  if (patch.active !== undefined) {
    updates.push(`active = $${i++}`);
    values.push(Boolean(patch.active));
  }

  if (patch.password !== undefined) {
    if (!patch.password || patch.password.length < 4) {
      throw Object.assign(new Error('Password must be at least 4 characters'), { code: 'INVALID_PASSWORD' });
    }
    updates.push(`password_hash = $${i++}`);
    values.push(hashPassword(patch.password));
  }

  if (updates.length === 0) return existing;

  updates.push(`updated_at = NOW()`);
  values.push(id);
  await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, values);

  if (patch.active === false) {
    await pool.query(`DELETE FROM auth_sessions WHERE user_id = $1`, [id]);
  }

  return findUserPublic(id);
}

/**
 * ENSURE_USERS=saleh:1234:Saleh:user,malek:1234:Malek:admin
 * Format per user: username:password:displayName:role
 */
export function parseEnsureUsersEnv() {
  const raw = process.env.ENSURE_USERS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [username, password, displayName, role] = part.split(':');
      return {
        username: (username || '').trim().toLowerCase(),
        password: password || '1234',
        displayName: (displayName || username || '').trim(),
        role: role === 'admin' ? 'admin' : 'user',
      };
    })
    .filter((u) => u.username.length >= 2);
}

export async function ensureUsersFromEnv() {
  const specs = parseEnsureUsersEnv();
  for (const spec of specs) {
    const existing = await findUserByUsername(spec.username);
    if (existing) {
      const pool = getPool();
      await pool.query(
        `UPDATE users
         SET password_hash = $1, display_name = $2, role = $3, active = TRUE, updated_at = NOW()
         WHERE username = $4`,
        [hashPassword(spec.password), spec.displayName, spec.role, spec.username]
      );
      console.log(`[auth] Ensured user @${spec.username} (${spec.displayName}) [${spec.role}]`);
    } else {
      await createUser(spec);
      console.log(`[auth] Created user @${spec.username} (${spec.displayName}) [${spec.role}]`);
    }
  }
}

export async function countActiveAdmins(excludeUserId = null) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM users
     WHERE role = 'admin' AND active = TRUE AND ($1::text IS NULL OR id <> $1)`,
    [excludeUserId]
  );
  return rows[0].c;
}
