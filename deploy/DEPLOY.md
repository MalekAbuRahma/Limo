# FleetFlow — VPS deployment

## Stack

| Service    | Image / build      | Port (host) | Volume              |
|-----------|--------------------|-------------|---------------------|
| PostgreSQL | `postgres:16-alpine` | internal only | `fleetflow_pgdata` |
| App       | `Dockerfile`       | `8080` (`.env`; 80 often taken by cPanel) | none (state in DB)  |

## Quick deploy (from project root)

**Windows (PowerShell):**

```powershell
cd deploy
.\deploy-to-server.ps1 -Host 147.93.122.6 -User root
```

**Node (recommended on Windows):**

```powershell
# 1) Copy deploy/.env.deploy.example → deploy/.env.deploy and set DEPLOY_SSH_PASSWORD
# 2) From project root:
npm install
npm run deploy
```

Or with an env var:

```powershell
$env:DEPLOY_SSH_PASSWORD='your-root-password'
npm run deploy
```

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot find package 'ssh2'` | Run `npm install` at project root (`ssh2` is a devDependency). |
| `Set DEPLOY_SSH_PASSWORD` | Create `deploy/.env.deploy` from `deploy/.env.deploy.example`. |
| `tar: SCHILY.fflags` warnings | Harmless on extract; archives now use `--format gnu` on Windows. |
| PowerShell script resets DB password | Use `npm run deploy` (Node) — `deploy-to-server.ps1` now keeps existing `.env`. |

## Manual steps on server

```bash
ssh root@YOUR_HOST
mkdir -p /opt/fleetflow
# upload project files to /opt/fleetflow
cd /opt/fleetflow
cp .env.production.example .env
# edit POSTGRES_PASSWORD in .env
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
curl -s http://127.0.0.1/api/health
```

## Push users to the server

Syncs accounts from `.env` (`ENSURE_ADMIN`, `ENSURE_USERS`) plus **malek** (app default):

```powershell
$env:DEPLOY_SSH_PASSWORD='your-root-password'
npm run users:push
```

Logins after sync: `admin` / `1234`, `malek` / `1234`, `saleh` / `1234`.

## Push local SQLite data to the server

Your local `data/taxi.db` is uploaded and migrated into production PostgreSQL:

```powershell
$env:DEPLOY_SSH_PASSWORD='your-root-password'
npm run db:push
```

## Operations

```bash
cd /opt/fleetflow
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml restart app
docker compose -f docker-compose.prod.yml down          # stop (keeps DB volume)
docker volume inspect fleetflow_pgdata                 # DB persistence
```

## Security

- Change `POSTGRES_PASSWORD` before first `up`.
- Prefer SSH keys over root password; restrict port 5432 (not published in prod compose).
- Rotate credentials if they were shared in chat.
