# VIP limousine CARS — Production readiness

Last verified: run `npm run test:all` before every deploy.

## Automated tests (`npm run test:all`)

| Step | What it checks |
|------|----------------|
| Calculations | Revenue, expenses, net profit, ROI, accidents, licenses |
| Sample data | 36-month sample dataset consistency |
| Filters | Search, pagination, driver filters |
| Integration | Migrations, backup JSON, Excel headers, SQLite round-trip |
| Fleet / multi-car | Per-vehicle DB isolation, fleet API (if server on :3001) |
| Production build | Vite build completes without errors |

## Pre-deploy checklist

### Must do

- [ ] `npm run test:all` — all green
- [ ] `npm run build` — `dist/` folder created
- [ ] Copy `data/taxi.db` backup before deploy
- [ ] Set `DB_PATH` on server to persistent path (e.g. `/var/www/vip-limousine/data/taxi.db`)
- [ ] Run API with PM2: `node server/index.js`
- [ ] Serve `dist/` + proxy `/api` → port 3001 (Nginx/Caddy)
- [ ] Enable **HTTPS**

### Security (required for public internet)

- [ ] Login is **client-only** today — add server auth before exposing widely
- [ ] Protect `/api/fleet/*` — no authentication on API yet
- [ ] Do not commit `data/taxi.db` or `.env` secrets to Git
- [ ] Change demo passwords (`admin/admin`, `malek/1234`) or remove them

### Recommended

- [ ] Daily backup of `taxi.db`
- [ ] `npm run stop` before deploy, then restart services
- [ ] Test garage → add car → tracking → refresh → data persists
- [ ] Test delete car confirmation (type exact name)

## Deploy commands (example)

```bash
npm ci --omit=dev
npm run build
# PM2
pm2 start server/index.js --name vip-api
# Nginx serves dist/ and proxies /api to 3001
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_PORT` | `3001` | Express API port |
| `DB_PATH` | `./data/taxi.db` | SQLite file path |
| `VITE_API_URL` | (empty) | Build-time API base; empty = same origin `/api` |

## Known limitations

- Single SQLite file — fine for one office; not for thousands of concurrent users
- Large images stored in DB as data URLs — keep photos reasonably small
- Run **one** instance only per database file

## Local run

Double-click `START-VIP-limousine-CAR.bat` or:

```bash
npm install
npm run server   # terminal 1
npm run dev      # terminal 2
```

Open http://localhost:3000/
