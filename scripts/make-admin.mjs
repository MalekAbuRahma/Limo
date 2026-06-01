/**
 * Promote a user to admin by username.
 * Usage: npm run user:admin -- malek
 *        npm run user:admin -- (lists all users)
 */
import 'dotenv/config';
import { initDb, closeDb } from '../server/db.js';
import { findUserByUsername } from '../server/auth.js';
import { getPool } from '../server/pgPool.js';

const username = process.argv[2]?.trim().toLowerCase();

async function listAll() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT username, display_name, role, active FROM users ORDER BY username`
  );
  console.log('\nUsers in database:\n');
  for (const r of rows) {
    console.log(
      `  @${r.username}  ${r.display_name}  [${r.role}]${r.active ? '' : ' (inactive)'}`
    );
  }
  console.log('\nRun: npm run user:admin -- <username>\n');
}

async function main() {
  await initDb();

  if (!username) {
    await listAll();
    await closeDb();
    return;
  }

  const existing = await findUserByUsername(username);
  if (!existing) {
    console.error(`User not found: "${username}"`);
    await listAll();
    process.exit(1);
  }

  const pool = getPool();
  await pool.query(
    `UPDATE users SET role = 'admin', active = TRUE, updated_at = NOW() WHERE username = $1`,
    [username]
  );

  console.log(`✓ @${username} is now admin (${existing.display_name})`);
  console.log('  Log out and sign in again so the app picks up the new role.\n');

  await closeDb();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
