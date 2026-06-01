/**
 * Create or update admin user in PostgreSQL.
 * Usage: npm run user:ensure-admin
 *        npm run user:ensure-admin -- admin 1234
 *
 * Or set in .env: ENSURE_ADMIN=admin:1234 then restart API (npm run server).
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, closeDb } from '../server/db.js';
import { ensureAdminUser, parseEnsureAdminEnv } from '../server/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env') });
config({ path: path.join(__dirname, '../.env.local'), override: true });

const username = (process.argv[2] || 'admin').trim().toLowerCase();
const password = process.argv[3] || '1234';
const displayName = process.env.ADMIN_DISPLAY_NAME || 'مدير النظام';

async function main() {
  await initDb();

  const fromEnv = parseEnsureAdminEnv();
  const creds = fromEnv ?? { username, password, displayName };

  await ensureAdminUser(creds);
  console.log('\n✓ Admin account ready:');
  console.log(`    Username: ${creds.username}`);
  console.log(`    Password: ${creds.password}`);
  console.log('\n  Log out of the app, then sign in with these credentials.\n');

  await closeDb();
}

main().catch((e) => {
  console.error('\nDatabase error:', e.message || e);
  console.error(`
Fix DATABASE_URL in .env (real PostgreSQL password), then run again:

  DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/vip_limousine_cars
  ENSURE_ADMIN=admin:1234

Or run in pgAdmin (database vip_limousine_cars) after generating a hash:

  npm run user:hash -- 1234
`);
  process.exit(1);
});
