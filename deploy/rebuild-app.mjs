import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { requireDeployPassword } from './load-deploy-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

requireDeployPassword();
const password = process.env.DEPLOY_SSH_PASSWORD;

function upload(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(local, remote, (e) => (e ? reject(e) : resolve()));
    });
  });
}

function exec(conn, cmd, ms = 600000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let errOut = '';
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      stream.on('data', (d) => process.stdout.write(d));
      stream.stderr.on('data', (d) => {
        errOut += d;
        process.stderr.write(d);
      });
      stream.on('close', (code) => {
        clearTimeout(t);
        code ? reject(new Error(errOut || `exit ${code}`)) : resolve();
      });
    });
  });
}

const conn = new Client();
conn.on('ready', async () => {
  try {
    await upload(conn, join(root, 'Dockerfile'), '/opt/fleetflow/Dockerfile');
    await exec(
      conn,
      'cd /opt/fleetflow && docker compose --env-file .env -f docker-compose.prod.yml up -d --build app'
    );
    await exec(conn, 'sleep 8 && curl -s http://127.0.0.1:8080/api/fleet | head -c 400');
    console.log('\n\nOK');
  } finally {
    conn.end();
  }
}).connect({ host: '147.93.122.6', username: 'root', password });
