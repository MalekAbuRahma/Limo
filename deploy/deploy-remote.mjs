#!/usr/bin/env node
/**
 * Non-interactive deploy via SSH (password from DEPLOY_SSH_PASSWORD).
 * Usage: DEPLOY_SSH_PASSWORD='...' node deploy/deploy-remote.mjs
 */
import { Client } from 'ssh2';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const host = process.env.DEPLOY_HOST || '147.93.122.6';
const user = process.env.DEPLOY_USER || 'root';
const password = process.env.DEPLOY_SSH_PASSWORD;
const remoteDir = process.env.DEPLOY_DIR || '/opt/fleetflow';
const appPort = process.env.APP_PORT || '8080';

if (!password) {
  console.error('Set DEPLOY_SSH_PASSWORD');
  process.exit(1);
}

function exec(conn, cmd, timeoutMs = 600000) {
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
          process.stdout.write(s);
        })
        .stderr.on('data', (d) => {
          const s = d.toString();
          errOut += s;
          process.stderr.write(s);
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

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
      .connect({ host, port: 22, username: user, password, readyTimeout: 30000 });
  });
}

const archive = join(process.env.TEMP || '/tmp', 'fleetflow-deploy.tar.gz');
console.log('Creating archive...');
execSync(
  `tar -czf "${archive}" --exclude=node_modules --exclude=dist --exclude=.git --exclude="*.bat" --exclude=data --exclude=.env --exclude=.env.local --exclude=.env.deploy .`,
  { cwd: projectRoot, stdio: 'inherit' }
);

const setupSh = readFileSync(join(__dirname, 'setup-server.sh'), 'utf8');

const conn = await connect();
console.log(`Connected to ${user}@${host}`);

try {
  console.log('\n--- Server setup ---');
  const setupB64 = Buffer.from(setupSh.replace(/\r\n/g, '\n'), 'utf8').toString('base64');
  await exec(conn, `echo ${setupB64} | base64 -d | tr -d '\\r' | bash`, 300000);

  console.log('\n--- Upload ---');
  await exec(conn, `mkdir -p ${remoteDir}`);
  await upload(conn, archive, '/tmp/fleetflow-deploy.tar.gz');
  await exec(
    conn,
    `cp -f ${remoteDir}/.env /tmp/fleetflow.env.bak 2>/dev/null || true`
  );
  await exec(
    conn,
    `tar -xzf /tmp/fleetflow-deploy.tar.gz -C ${remoteDir} && rm -f /tmp/fleetflow-deploy.tar.gz`
  );
  await exec(
    conn,
    `test -f /tmp/fleetflow.env.bak && cp -f /tmp/fleetflow.env.bak ${remoteDir}/.env && chmod 600 ${remoteDir}/.env && rm -f /tmp/fleetflow.env.bak`
  );

  const hasEnv = await exec(
    conn,
    `test -f ${remoteDir}/.env && grep -q '^POSTGRES_PASSWORD=.' ${remoteDir}/.env && echo yes || echo no`,
    30000
  );
  if (hasEnv.trim() !== 'yes') {
    const pgPass = randomBytes(16).toString('base64url');
    const envBody = `POSTGRES_USER=postgres
POSTGRES_PASSWORD=${pgPass}
POSTGRES_DB=vip_limousine_cars
APP_PORT=${appPort}
GEMINI_API_KEY=
`;
    const envB64 = Buffer.from(envBody, 'utf8').toString('base64');
    await exec(conn, `echo ${envB64} | base64 -d > ${remoteDir}/.env && chmod 600 ${remoteDir}/.env`);
    console.log('Created new .env (first deploy).');
  } else {
    console.log('Keeping existing .env (database password unchanged).');
  }

  console.log('\n--- Docker build & start (this can take several minutes) ---');
  await exec(
    conn,
    `cd ${remoteDir} && docker compose --env-file .env -f docker-compose.prod.yml up -d --build`,
    900000
  );

  console.log('\n--- Health check ---');
  const health = await exec(
    conn,
    `for i in 1 2 3 4 5 6; do curl -sf http://127.0.0.1:${appPort}/api/health && exit 0; sleep 3; done; exit 1`
  );
  console.log('\nHealth:', health.trim());
  console.log(`\nDeployed: http://${host}:${appPort}/`);
} finally {
  conn.end();
  if (existsSync(archive)) {
    try {
      execSync(`del /f "${archive}"`, { stdio: 'ignore', shell: true });
    } catch {
      /* ignore */
    }
  }
}
