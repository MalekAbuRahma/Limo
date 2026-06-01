import { Client } from 'ssh2';

const password = process.env.DEPLOY_SSH_PASSWORD;
const cmd = `
ss -tlnp | head -20
docker ps -a
sed -i 's/APP_PORT=80/APP_PORT=8080/' /opt/fleetflow/.env
cd /opt/fleetflow && docker compose --env-file .env -f docker-compose.prod.yml up -d app
sleep 8
curl -sf http://127.0.0.1:8080/api/health
docker compose -f docker-compose.prod.yml ps
`;

const conn = new Client();
conn
  .on('ready', () => {
    conn.exec(cmd, (err, stream) => {
      stream.on('data', (d) => process.stdout.write(d));
      stream.stderr.on('data', (d) => process.stderr.write(d));
      stream.on('close', (code) => {
        conn.end();
        process.exit(code || 0);
      });
    });
  })
  .connect({ host: '147.93.122.6', username: 'root', password });
