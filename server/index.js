import express from 'express';
import cors from 'cors';
import {
  closeDb,
  createVehicle,
  databaseFile,
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
  res.json({ ok: true, storage: 'sqlite', databaseFile, multiVehicle: true });
});

/** Fleet garage: all vehicles with summary stats */
app.get('/api/fleet', (_req, res) => {
  try {
    res.json(getFleet());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read fleet' });
  }
});

/** Create a new vehicle */
app.post('/api/fleet/vehicles', (req, res) => {
  try {
    const label = String(req.body?.label ?? '').trim() || 'سيارة جديدة';
    const vehicleImage = req.body?.vehicleImage ?? '';
    const id = createVehicle({ label, vehicleImage });
    res.status(201).json({ id, label });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

/** Full state for one vehicle */
app.get('/api/fleet/vehicles/:id/state', (req, res) => {
  try {
    const state = getVehicleState(req.params.id);
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: 'Vehicle not found' });
  }
});

/** Save one vehicle's data (isolated) */
app.put('/api/fleet/vehicles/:id/state', (req, res) => {
  try {
    if (!req.body?.settings || !Array.isArray(req.body?.entries)) {
      res.status(400).json({ error: 'Invalid state payload' });
      return;
    }
    const current = getVehicleState(req.params.id);
    saveVehicleState(req.params.id, {
      settings: req.body.settings,
      entries: req.body.entries,
      accidents: Array.isArray(req.body.accidents) ? req.body.accidents : current.accidents,
      licenses: Array.isArray(req.body.licenses) ? req.body.licenses : current.licenses,
      oilChanges: Array.isArray(req.body.oilChanges) ? req.body.oilChanges : current.oilChanges,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save vehicle' });
  }
});

/** Delete vehicle and all its data */
app.delete('/api/fleet/vehicles/:id', (req, res) => {
  try {
    deleteVehicle(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to delete vehicle' });
  }
});

/** Legacy single-vehicle API */
app.get('/api/state', (_req, res) => {
  try {
    res.json(getAppState());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read database' });
  }
});

app.put('/api/state', (req, res) => {
  try {
    if (!req.body?.settings || !Array.isArray(req.body?.entries)) {
      res.status(400).json({ error: 'Invalid state payload' });
      return;
    }
    const current = getAppState();
    saveAppState({
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

async function main() {
  await initDb();
  const server = app.listen(PORT, () => {
    console.log(`Taxi API running on http://localhost:${PORT}`);
    console.log(`SQLite database: ${databaseFile}`);
    console.log('Multi-vehicle fleet API: /api/fleet');
  });

  const shutdown = () => {
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
