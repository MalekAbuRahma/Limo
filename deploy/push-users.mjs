#!/usr/bin/env node
/**
 * Sync local .env users (ENSURE_ADMIN, ENSURE_USERS) to production PostgreSQL.
 * Usage: DEPLOY_SSH_PASSWORD='...' node deploy/push-users.mjs
 */
import { Client } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import './load-deploy-env.mjs';
import { requireDeployPassword } from './load-deploy-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

requireDeployPassword();

const password = process.env.DEPLOY_SSH_PASSWORD;
const host = process.env.DEPLOY_HOST || '147.93.122.6';
const remoteDir = process.env.DEPLOY_DIR || '/opt/fleetflow';

function exec(conn, cmd, timeoutMs = 300000, { quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: false }, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      let errOut = '';
      const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
      stream
        .on('close', (code) => {
          clearTimeout(timer);
          if (code !== 0) reject(new Error(`Exit ${code}: ${errOut || out}`));
          else resolve(out);
        })
        .on('data', (d) => {
          const s = d.toString();
          out += s;
          if (!quiet) process.stdout.write(s);
        })
        .stderr.on('data', (d) => {
          errOut += d.toString();
          if (!quiet) process.stderr.write(d);
        });
    });
  });
}

function upload(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(local, remote, (e) => (e ? reject(e) : resolve()));
    });
  });
}

function parseEnvFile(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\"'\"'`)}'`;
}

const ensureAdmin = process.env.ENSURE_ADMIN || 'admin:1234';
const ensureUsers = process.env.ENSURE_USERS || 'saleh:1234:Saleh:user';
const migrateUsers = process.env.MIGRATE_USERS || '';

console.log('Users to sync:');
console.log(`  ENSURE_ADMIN=${ensureAdmin}`);
console.log(`  ENSURE_USERS=${ensureUsers}`);
if (migrateUsers) console.log(`  MIGRATE_USERS=${migrateUsers}`);
console.log('  + malek (default admin from app)\n');

const conn = new Client();
conn
  .on('ready', async () => {
    try {
      console.log(`Connected to ${host}\n`);
      for (const rel of [
        'scripts/migrate-users.mjs',
        'server/auth.js',
        'server/users.js',
        'server/password.js',
        'server/db.js',
        'server/schema.js',
        'server/pgPool.js',
      ]) {
        await upload(conn, join(projectRoot, rel), `${remoteDir}/${rel}`);
      }

      const envText = await exec(conn, `cat ${remoteDir}/.env`, 30000, { quiet: true });
      const serverEnv = parseEnvFile(envText);
      const pgUser = serverEnv.POSTGRES_USER || 'postgres';
      const pgPass = serverEnv.POSTGRES_PASSWORD;
      const pgDb = serverEnv.POSTGRES_DB || 'vip_limousine_cars';
      if (!pgPass) throw new Error('POSTGRES_PASSWORD missing on server');

      const dbUrl = `postgresql://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPass)}@postgres:5432/${pgDb}`;
      const dbUrlB64 = Buffer.from(dbUrl, 'utf8').toString('base64');

      const migrateEnv = [
        `DATABASE_URL=${dbUrl}`,
        `ENSURE_ADMIN=${ensureAdmin}`,
        `ENSURE_USERS=${ensureUsers}`,
        migrateUsers ? `MIGRATE_USERS=${migrateUsers}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const migrateEnvB64 = Buffer.from(migrateEnv, 'utf8').toString('base64');

      await exec(
        conn,
        [
          `echo ${dbUrlB64} | base64 -d > /tmp/fleetflow-dburl.raw`,
          `echo ${migrateEnvB64} | base64 -d > /tmp/fleetflow-users.env`,
          `docker run --rm --network fleetflow_net -v ${remoteDir}:/app -w /app ` +
            `--env-file /tmp/fleetflow-users.env ` +
            `-e DATABASE_URL="$(cat /tmp/fleetflow-dburl.raw)" ` +
            `node:22-alpine sh -c "npm ci --omit=dev && npm install tsx@4.19.4 --no-save && npx tsx scripts/migrate-users.mjs"`,
          `rm -f /tmp/fleetflow-dburl.raw /tmp/fleetflow-users.env`,
          `cd ${remoteDir} && docker compose --env-file .env -f docker-compose.prod.yml restart app`,
          `sleep 6 && curl -sf http://127.0.0.1:8080/api/health`,
        ].join(' && '),
        600000
      );

      console.log('\n\nDone. Log in at http://' + host + ':8080/');
      console.log('  admin / 1234  |  malek / 1234  |  saleh / 1234');
    } finally {
      conn.end();
    }
  })
  .on('error', (e) => {
    console.error(e);
    process.exit(1);
  })
  .connect({ host, port: 22, username: 'root', password, readyTimeout: 30000 });
