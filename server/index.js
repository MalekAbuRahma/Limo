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
import {
  countUsers,
  ensureAdminUser,
  extractBearerToken,
  login,
  logout,
  parseEnsureAdminEnv,
  validateSession,
} from './auth.js';
import { requireAdmin, requireAuth, requireAdminForDestructive } from './authMiddleware.js';
import {
  countActiveAdmins,
  createUser,
  ensureUsersFromEnv,
  listAssignableUsers,
  listUsers,
  updateUser,
} from './users.js';
import {
  assertUserCanReceiveVehicle,
  assertVehicleAccess,
  resolveAssignedUserIdForCreate,
} from './vehicleAccess.js';
import { updateVehicleAssignment } from './db.js';
import {
  countPendingDeletionRequests,
  createDeletionRequest,
  listDeletionRequests,
  reviewDeletionRequest,
} from './deletionRequests.js';

const app = express();
const PORT = Number(process.env.API_PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req, res) => {
  let userCount = 0;
  try {
    userCount = await countUsers();
  } catch {
    /* pool not ready */
  }
  res.json({
    ok: true,
    apiVersion: 2,
    storage: 'postgresql',
    database: databaseConnection(),
    multiVehicle: true,
    auth: process.env.AUTH_DISABLED === '1' ? 'disabled' : 'enabled',
    authRoutes: true,
    userCount,
  });
});

/** One-time setup: create/update admin when ENSURE_ADMIN is set or body secret matches BOOTSTRAP_SECRET */
app.post('/api/bootstrap/ensure-admin', async (req, res) => {
  try {
    const ensure = parseEnsureAdminEnv();
    const secret = process.env.BOOTSTRAP_SECRET?.trim();
    const bodySecret = String(req.body?.secret ?? '').trim();
    const allowed =
      ensure ||
      (secret && bodySecret === secret) ||
      (process.env.ALLOW_BOOTSTRAP === '1' && bodySecret === 'fleetflow-setup');

    if (!allowed) {
      res.status(403).json({
        error: 'Bootstrap disabled. Set ENSURE_ADMIN=admin:1234 in .env and restart, or ALLOW_BOOTSTRAP=1',
      });
      return;
    }

    const username = String(req.body?.username ?? ensure?.username ?? 'admin')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? ensure?.password ?? '1234');
    const displayName = String(req.body?.displayName ?? ensure?.displayName ?? 'مدير النظام');

    await ensureAdminUser({ username, password, displayName });
    res.json({
      ok: true,
      username,
      message: `Admin @${username} is ready. Log out and sign in again.`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Bootstrap failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username ?? '');
    const password = String(req.body?.password ?? '');
    const result = await login(username, password);
    if (!result) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    await logout(req.authToken);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  if (process.env.AUTH_DISABLED === '1') {
    res.json({
      user: { id: 'local', username: 'local', displayName: 'Local', role: 'admin', active: true },
    });
    return;
  }
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const user = await validateSession(token);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Session check failed' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    res.json({ users: await listUsers() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await createUser({
      username: req.body?.username,
      password: req.body?.password,
      displayName: req.body?.displayName,
      role: req.body?.role,
    });
    res.status(201).json({ user });
  } catch (err) {
    console.error(err);
    const code = err?.code;
    if (code === 'USERNAME_TAKEN' || code === 'INVALID_USERNAME' || code === 'INVALID_PASSWORD') {
      res.status(400).json({ error: err.message, code });
      return;
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const patch = {
      displayName: req.body?.displayName,
      role: req.body?.role,
      active: req.body?.active,
      password: req.body?.password,
    };

    const target = (await listUsers()).find((u) => u.id === id);
    if (target) {
      const afterRole = patch.role ?? target.role;
      const afterActive = patch.active !== undefined ? Boolean(patch.active) : target.active;
      const willBeActiveAdmin = afterActive && afterRole === 'admin';
      if (target.role === 'admin' && target.active && !willBeActiveAdmin) {
        const otherAdmins = await countActiveAdmins(id);
        if (otherAdmins < 1) {
          res.status(400).json({
            error: 'Cannot remove the last active administrator',
            code: 'LAST_ADMIN',
          });
          return;
        }
      }
    }

    const user = await updateUser(id, patch);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  } catch (err) {
    console.error(err);
    const code = err?.code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (code === 'INVALID_PASSWORD' || code === 'INVALID_ROLE' || code === 'INVALID_DISPLAY_NAME') {
      res.status(400).json({ error: err.message, code });
      return;
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.use('/api/deletion-requests', requireAuth);

app.get('/api/deletion-requests/pending-count', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      res.json({ count: 0 });
      return;
    }
    res.json({ count: await countPendingDeletionRequests() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to count requests' });
  }
});

app.get('/api/deletion-requests', async (req, res) => {
  try {
    const status = String(req.query.status || 'pending');
    const requests = await listDeletionRequests(req.user, { status });
    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list deletion requests' });
  }
});

app.post('/api/deletion-requests', async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      res.status(400).json({
        error: 'Administrators delete directly — no approval request needed',
        code: 'ADMIN_DIRECT',
      });
      return;
    }
    const request = await createDeletionRequest(req.user, {
      vehicleId: req.body?.vehicleId,
      requestType: req.body?.requestType,
      targetId: req.body?.targetId,
      summary: req.body?.summary,
      details: req.body?.details,
    });
    res.status(201).json({ request });
  } catch (err) {
    console.error(err);
    if (err?.code === 'VEHICLE_ACCESS_DENIED') {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err?.code === 'DUPLICATE_PENDING' || err?.code === 'INVALID_REQUEST') {
      res.status(400).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to create deletion request' });
  }
});

app.post('/api/deletion-requests/:id/approve', requireAdmin, async (req, res) => {
  try {
    const request = await reviewDeletionRequest(
      req.params.id,
      req.user,
      true,
      req.body?.reviewNote
    );
    res.json({ request });
  } catch (err) {
    console.error(err);
    if (err?.code === 'NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err?.code === 'ALREADY_REVIEWED') {
      res.status(400).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err.message || 'Failed to approve' });
  }
});

app.post('/api/deletion-requests/:id/reject', requireAdmin, async (req, res) => {
  try {
    const request = await reviewDeletionRequest(
      req.params.id,
      req.user,
      false,
      req.body?.reviewNote
    );
    res.json({ request });
  } catch (err) {
    console.error(err);
    if (err?.code === 'NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err?.code === 'ALREADY_REVIEWED') {
      res.status(400).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

app.use('/api/fleet', requireAuth);

app.get('/api/fleet', async (req, res) => {
  try {
    res.json(await getFleet(req.user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read fleet' });
  }
});

app.get('/api/fleet/assignable-users', async (req, res) => {
  try {
    res.json({ users: await listAssignableUsers(req.user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

app.post('/api/fleet/vehicles', async (req, res) => {
  try {
    const label = String(req.body?.label ?? '').trim() || 'سيارة جديدة';
    const vehicleImage = req.body?.vehicleImage ?? '';
    const assignedUserId = resolveAssignedUserIdForCreate(
      req.user,
      req.body?.assignedUserId
    );
    await assertUserCanReceiveVehicle(assignedUserId);
    const id = await createVehicle({
      label,
      vehicleImage,
      ownerName: String(req.body?.ownerName ?? ''),
      monthlyGuarantee: Number(req.body?.monthlyGuarantee) || 750,
      currentDriverName: String(req.body?.currentDriverName ?? ''),
      vehicleCost: Number(req.body?.vehicleCost) || 33000,
      vehicleLifeYears: Number(req.body?.vehicleLifeYears) || 7,
      assignedUserId,
    });
    res.status(201).json({ id, label, assignedUserId });
  } catch (err) {
    console.error(err);
    if (
      err?.code === 'VEHICLE_IMAGE_REQUIRED' ||
      err?.code === 'ASSIGNED_USER_REQUIRED' ||
      err?.code === 'INVALID_ASSIGNED_USER'
    ) {
      res.status(400).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

app.patch('/api/fleet/vehicles/:id/assignment', requireAdmin, async (req, res) => {
  try {
    const assignedUserId = String(req.body?.assignedUserId ?? '').trim();
    if (!assignedUserId) {
      res.status(400).json({ error: 'assignedUserId is required' });
      return;
    }
    await assertUserCanReceiveVehicle(assignedUserId);
    await updateVehicleAssignment(req.params.id, assignedUserId);
    res.json({ ok: true, assignedUserId });
  } catch (err) {
    console.error(err);
    if (err?.code === 'NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err?.code === 'INVALID_ASSIGNED_USER') {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

app.get('/api/fleet/vehicles/:id/state', async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.id);
    res.json(await getVehicleState(req.params.id));
  } catch (err) {
    console.error(err);
    if (err?.code === 'VEHICLE_ACCESS_DENIED') {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(404).json({ error: 'Vehicle not found' });
  }
});

app.put('/api/fleet/vehicles/:id/state', async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.id);
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

app.delete('/api/fleet/vehicles/:id', requireAdminForDestructive, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.id);
    await deleteVehicle(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to delete vehicle' });
  }
});

app.use('/api/state', requireAuth);

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
  const ensure = parseEnsureAdminEnv();
  if (ensure) {
    await ensureAdminUser(ensure);
  }
  await ensureUsersFromEnv();
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
