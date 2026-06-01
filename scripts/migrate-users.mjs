/**
 * Sync users into PostgreSQL from ENSURE_ADMIN, ENSURE_USERS, and MIGRATE_USERS.
 * Run on server: DATABASE_URL=... ENSURE_ADMIN=... node scripts/migrate-users.mjs
 */
import 'dotenv/config';
import { initDb, closeDb } from '../server/db.js';
import { ensureAdminUser, parseEnsureAdminEnv, findUserByUsername } from '../server/auth.js';
import {
  ensureUsersFromEnv,
  parseEnsureUsersEnv,
  createUser,
} from '../server/users.js';
import { hashPassword } from '../server/password.js';
import { getPool } from '../server/pgPool.js';

/** App demo accounts (Login screen) — merged if not already in ENSURE_* */
const DEFAULT_EXTRA_USERS = [
  { username: 'malek', password: '1234', displayName: 'Malek', role: 'admin' },
];

function parseMigrateUsersEnv() {
  const raw = process.env.MIGRATE_USERS?.trim();
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

async function upsertUser(spec) {
  const existing = await findUserByUsername(spec.username);
  if (existing) {
    const pool = getPool();
    await pool.query(
      `UPDATE users
       SET password_hash = $1, display_name = $2, role = $3, active = TRUE, updated_at = NOW()
       WHERE username = $4`,
      [hashPassword(spec.password), spec.displayName, spec.role, spec.username]
    );
    console.log(`Updated @${spec.username} (${spec.displayName}) [${spec.role}]`);
    return existing.id;
  }
  const user = await createUser(spec);
  console.log(`Created @${user.username} (${user.displayName}) [${user.role}]`);
  return user.id;
}

function mergeUserSpecs(...lists) {
  const byName = new Map();
  for (const list of lists) {
    for (const u of list) {
      if (u?.username) byName.set(u.username, u);
    }
  }
  return [...byName.values()];
}

async function main() {
  await initDb();

  const adminSpec = parseEnsureAdminEnv();
  if (adminSpec) {
    await ensureAdminUser(adminSpec);
  } else if (process.env.ENSURE_ADMIN === undefined) {
    await ensureAdminUser({ username: 'admin', password: '1234', displayName: 'مدير النظام' });
  }

  await ensureUsersFromEnv();

  const ensured = parseEnsureUsersEnv();
  const extras = mergeUserSpecs(
    DEFAULT_EXTRA_USERS,
    parseMigrateUsersEnv(),
    ensured.length ? [] : [{ username: 'saleh', password: '1234', displayName: 'Saleh', role: 'user' }]
  );

  for (const spec of extras) {
    if (adminSpec?.username === spec.username) continue;
    if (ensured.some((e) => e.username === spec.username)) continue;
    await upsertUser(spec);
  }

  const { rows } = await getPool().query(
    `SELECT username, display_name, role, active FROM users ORDER BY role DESC, username`
  );
  console.log('\nUsers in database:');
  for (const r of rows) {
    console.log(`  - ${r.username} (${r.display_name}) [${r.role}]${r.active ? '' : ' inactive'}`);
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
