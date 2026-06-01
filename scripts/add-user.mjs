/**
 * Add a user to PostgreSQL.
 * Usage: npm run user:add -- saleh 1234 Saleh user
 *        npm run user:add -- saleh 1234 Saleh
 *        (defaults: password 1234, role user)
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, closeDb } from '../server/db.js';
import { createUser } from '../server/users.js';
import { findUserByUsername } from '../server/auth.js';
import { hashPassword } from '../server/password.js';
import { getPool } from '../server/pgPool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env') });
config({ path: path.join(__dirname, '../.env.local'), override: true });

const username = (process.argv[2] || '').trim().toLowerCase();
const password = process.argv[3] || '1234';
const displayName = process.argv[4] || username;
const role = process.argv[5] === 'admin' ? 'admin' : 'user';

async function main() {
  if (!username || username.length < 2) {
    console.error('Usage: npm run user:add -- <username> [password] [displayName] [user|admin]');
    process.exit(1);
  }

  await initDb();

  const existing = await findUserByUsername(username);
  if (existing) {
    const pool = getPool();
    await pool.query(
      `UPDATE users
       SET password_hash = $1, display_name = $2, role = $3, active = TRUE, updated_at = NOW()
       WHERE username = $4`,
      [hashPassword(password), displayName, role, username]
    );
    console.log(`\n✓ Updated user @${username} (${displayName}) [${role}]\n`);
  } else {
    const user = await createUser({ username, password, displayName, role });
    console.log(`\n✓ Created user @${user.username} (${user.displayName}) [${user.role}]\n`);
  }

  console.log('  Login credentials:');
  console.log(`    Username: ${username}`);
  console.log(`    Password: ${password}`);
  console.log('');

  await closeDb();
}

main().catch((e) => {
  console.error('\nDatabase error:', e.message || e);
  console.error('Fix DATABASE_URL in .env, then run again.\n');
  process.exit(1);
});
