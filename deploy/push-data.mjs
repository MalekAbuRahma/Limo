#!/usr/bin/env node
/**
 * Upload local data/taxi.db and migrate into server PostgreSQL.
 * Usage: DEPLOY_SSH_PASSWORD='...' node deploy/push-data.mjs
 */
import { Client } from 'ssh2';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { requireDeployPassword } from './load-deploy-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const sqlitePath =
  process.env.SQLITE_PATH || join(projectRoot, 'data', 'taxi.db');
const host = process.env.DEPLOY_HOST || '147.93.122.6';
const user = process.env.DEPLOY_USER || 'root';
const password = process.env.DEPLOY_SSH_PASSWORD;
const remoteDir = process.env.DEPLOY_DIR || '/opt/fleetflow';

requireDeployPassword();
if (!existsSync(sqlitePath)) {
  console.error(`SQLite not found: ${sqlitePath}`);
  process.exit(1);
}

function exec(conn, cmd, timeoutMs = 600000, { quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: false }, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      let errOut = '';
      const timer = setTimeout(() => {
        stream.close();
        reject(new Error(`Timeout: ${cmd.slice(0, 80)}...`));
      }, timeoutMs);
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
          const s = d.toString();
          errOut += s;
          if (!quiet) process.stderr.write(s);
        });
    });
  });
}

function upload(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

function parseEnv(text) {
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

const conn = new Client();
conn
  .on('ready', async () => {
    try {
      console.log(`Connected to ${user}@${host}`);
      console.log(`Uploading ${sqlitePath} ...`);
      await exec(conn, `mkdir -p ${remoteDir}/data`);
      await upload(conn, sqlitePath, `${remoteDir}/data/taxi.db`);
      await upload(
        conn,
        join(projectRoot, 'scripts', 'migrate-sqlite-to-pg.mjs'),
        `${remoteDir}/scripts/migrate-sqlite-to-pg.mjs`
      );

      const envText = await exec(conn, `cat ${remoteDir}/.env`, 30000, { quiet: true });
      const env = parseEnv(envText);
      const pgUser = env.POSTGRES_USER || 'postgres';
      const pgPass = env.POSTGRES_PASSWORD;
      const pgDb = env.POSTGRES_DB || 'vip_limousine_cars';
      if (!pgPass) throw new Error('POSTGRES_PASSWORD missing in server .env');

      const dbUrl = `postgresql://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPass)}@postgres:5432/${pgDb}`;
      const dbUrlB64 = Buffer.from(dbUrl, 'utf8').toString('base64');

      console.log('\nMigrating SQLite → PostgreSQL on server (npm ci + migrate)...\n');
      await exec(
        conn,
        [
          `cd ${remoteDir}`,
          `echo ${dbUrlB64} | base64 -d > /tmp/fleetflow-dburl.raw`,
          `{ printf 'DATABASE_URL='; cat /tmp/fleetflow-dburl.raw; printf '\\nSQLITE_PATH=/app/data/taxi.db\\n'; } > /tmp/fleetflow-migrate.env`,
          `docker run --rm --network fleetflow_net -v ${remoteDir}:/app -w /app --env-file /tmp/fleetflow-migrate.env node:22-alpine sh -c "npm ci && npx tsx scripts/migrate-sqlite-to-pg.mjs"`,
          `rm -f /tmp/fleetflow-dburl.raw /tmp/fleetflow-migrate.env`,
        ].join(' && '),
        900000
      );

      const appPort = env.APP_PORT || '8080';
      console.log('\n--- Verify ---');
      const fleet = await exec(
        conn,
        `curl -s http://127.0.0.1:${appPort}/api/fleet | head -c 600`
      );
      console.log(fleet);
      console.log(`\nData live at http://${host}:${appPort}/`);
    } finally {
      conn.end();
    }
  })
  .on('error', (e) => {
    console.error(e);
    process.exit(1);
  })
  .connect({ host, port: 22, username: user, password, readyTimeout: 30000 });
