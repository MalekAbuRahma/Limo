import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  closeDb,
  createVehicle,
  databaseConnection,
  deleteVehicle,
  getFleet,
  getVehicleState,
  getAppState,
  initDb,
  saveAppState,
  saveVehicleState,
} from './db.js';

const app = express();
const PORT = Number(process.env.API_PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    storage: 'postgresql',
    database: databaseConnection(),
    multiVehicle: true,
  });
});

app.get('/api/fleet', async (_req, res) => {
  try {
    res.json(await getFleet());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read fleet' });
  }
});

app.post('/api/fleet/vehicles', async (req, res) => {
  try {
    const label = String(req.body?.label ?? '').trim() || 'سيارة جديدة';
    const vehicleImage = req.body?.vehicleImage ?? '';
    const id = await createVehicle({
      label,
      vehicleImage,
      ownerName: String(req.body?.ownerName ?? ''),
      monthlyGuarantee: Number(req.body?.monthlyGuarantee) || 750,
      currentDriverName: String(req.body?.currentDriverName ?? ''),
      vehicleCost: Number(req.body?.vehicleCost) || 33000,
      vehicleLifeYears: Number(req.body?.vehicleLifeYears) || 7,
    });
    res.status(201).json({ id, label });
  } catch (err) {
    console.error(err);
    if (err?.code === 'VEHICLE_IMAGE_REQUIRED') {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

app.get('/api/fleet/vehicles/:id/state', async (req, res) => {
  try {
    res.json(await getVehicleState(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: 'Vehicle not found' });
  }
});

app.put('/api/fleet/vehicles/:id/state', async (req, res) => {
  try {
    if (!req.body?.settings || !Array.isArray(req.body?.entries)) {
      res.status(400).json({ error: 'Invalid state payload' });
      return;
    }
    const current = await getVehicleState(req.params.id);
    await saveVehicleState(req.params.id, {
      settings: req.body.settings,
      entries: req.body.entries,
      accidents: Array.isArray(req.body.accidents) ? req.body.accidents : current.accidents,
      licenses: Array.isArray(req.body.licenses) ? req.body.licenses : current.licenses,
      oilChanges: Array.isArray(req.body.oilChanges) ? req.body.oilChanges : current.oilChanges,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    if (err?.code === 'VEHICLE_IMAGE_REQUIRED') {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Failed to save vehicle' });
  }
});

app.delete('/api/fleet/vehicles/:id', async (req, res) => {
  try {
    await deleteVehicle(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to delete vehicle' });
  }
});

app.get('/api/state', async (_req, res) => {
  try {
    res.json(await getAppState());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read database' });
  }
});

app.put('/api/state', async (req, res) => {
  try {
    if (!req.body?.settings || !Array.isArray(req.body?.entries)) {
      res.status(400).json({ error: 'Invalid state payload' });
      return;
    }
    const current = await getAppState();
    await saveAppState({
      settings: req.body.settings,
      entries: req.body.entries,
      accidents: Array.isArray(req.body.accidents) ? req.body.accidents : current.accidents,
      licenses: Array.isArray(req.body.licenses) ? req.body.licenses : current.licenses,
      oilChanges: Array.isArray(req.body.oilChanges) ? req.body.oilChanges : current.oilChanges,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save database' });
  }
});

const serveStatic =
  process.env.SERVE_STATIC === '1' || process.env.NODE_ENV === 'production';
if (serveStatic) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

async function main() {
  await initDb();
  const server = app.listen(PORT, () => {
    console.log(`Taxi API running on http://localhost:${PORT}`);
    console.log(`PostgreSQL: ${databaseConnection()}`);
    console.log('Multi-vehicle fleet API: /api/fleet');
  });

  const shutdown = async () => {
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start API:', err.message || err);
  console.error('Set DATABASE_URL in .env — see .env.example');
  process.exit(1);
});
