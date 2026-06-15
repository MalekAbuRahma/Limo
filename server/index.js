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
  listVehicleDrivers,
  addVehicleDriver,
  stopVehicleDriver,
  updateVehicleDriver,
  deleteVehicleDriver,
} from './db.js';
import {
  writeAuditLog,
  listAuditLog,
  getDriverProfile,
  updateDriverProfile,
  getActiveDriver,
  calculateDriverRunningBalance,
  handleDriverWithdrawal,
  replaceDriver,
  getDriverSettlement,
  listDriverAssignments,
  getFleetPerformanceRanking,
} from './driverLedger.js';
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
import { installProductionStatic } from './staticAssets.js';

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
    if (process.env.AUTH_DISABLED === '1') {
      const username = String(req.body?.username ?? 'admin').trim() || 'admin';
      res.json({
        token: 'dev-local',
        user: {
          id: 'local',
          username,
          displayName: process.env.ADMIN_DISPLAY_NAME?.trim() || 'مدير تجريبي',
          role: 'admin',
          active: true,
        },
      });
      return;
    }
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
  installProductionStatic(app, distDir);
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

// ── Driver History Routes ───────────────────────────────────────────────────

app.get('/api/vehicles/:vehicleId/drivers', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const drivers = await listVehicleDrivers(req.params.vehicleId);
    res.json({ drivers });
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to list drivers' });
  }
});

app.post('/api/vehicles/:vehicleId/drivers', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const { name, startDate, endDate, notes } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'اسم السائق مطلوب' });
    if (!startDate?.trim()) return res.status(400).json({ error: 'تاريخ أول دفعة مطلوب' });
    const driver = await addVehicleDriver(req.params.vehicleId, { name, startDate, endDate: endDate ?? null, notes });
    res.status(201).json({ driver });
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to add driver' });
  }
});

app.patch('/api/vehicles/:vehicleId/drivers/:driverId/stop', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const { endDate } = req.body ?? {};
    if (!endDate?.trim()) return res.status(400).json({ error: 'تاريخ الإيقاف مطلوب' });
    const driver = await stopVehicleDriver(req.params.driverId, endDate);
    res.json({ driver });
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to stop driver' });
  }
});

app.patch('/api/vehicles/:vehicleId/drivers/:driverId', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const { name, startDate, endDate, monthlyGuarantee, notes } = req.body ?? {};
    const driver = await updateVehicleDriver(req.params.driverId, { name, startDate, endDate, monthlyGuarantee, notes });
    res.json({ driver });
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err?.code === 'NO_CHANGES') return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to update driver' });
  }
});

app.delete('/api/vehicles/:vehicleId/drivers/:driverId', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    await deleteVehicleDriver(req.params.driverId);
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to delete driver' });
  }
});

// ── F1: Driver Running Balance ─────────────────────────────────────────────

app.get('/api/vehicles/:vehicleId/drivers/:driverId/balance', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const result = await calculateDriverRunningBalance(req.params.driverId, req.params.vehicleId);
    res.json(result);
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate balance' });
  }
});

// ── F2: Driver Withdrawal ──────────────────────────────────────────────────

app.post('/api/vehicles/:vehicleId/drivers/:driverId/withdraw', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const { endDate, monthlyGuarantee } = req.body ?? {};
    if (!endDate?.trim()) return res.status(400).json({ error: 'endDate is required' });
    const result = await handleDriverWithdrawal({
      vehicleId: req.params.vehicleId,
      driverId: req.params.driverId,
      endDate,
      monthlyGuarantee: Number(monthlyGuarantee ?? 750),
      performedBy: req.user?.id,
    });
    res.json(result);
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to withdraw driver' });
  }
});

// ── F3: Driver Replacement ─────────────────────────────────────────────────

app.post('/api/vehicles/:vehicleId/drivers/replace', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const { currentDriverId, currentDriverEndDate, newDriverName, newDriverStartDate, monthlyGuarantee } = req.body ?? {};
    if (!newDriverName?.trim()) return res.status(400).json({ error: 'newDriverName is required' });
    if (!newDriverStartDate?.trim()) return res.status(400).json({ error: 'newDriverStartDate is required' });
    const result = await replaceDriver({
      vehicleId: req.params.vehicleId,
      currentDriverId: currentDriverId || null,
      currentDriverEndDate: currentDriverEndDate || null,
      newDriverName,
      newDriverStartDate,
      monthlyGuarantee: Number(monthlyGuarantee ?? 750),
      performedBy: req.user?.id,
    });
    res.json(result);
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    if (err?.status === 409) return res.status(409).json({ error: err.message, activeDriver: err.activeDriver });
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to replace driver' });
  }
});

// ── F6: Driver Settlement ──────────────────────────────────────────────────

app.get('/api/vehicles/:vehicleId/drivers/:driverId/settlement', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const result = await getDriverSettlement(req.params.vehicleId, req.params.driverId);
    res.json(result);
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to get settlement' });
  }
});

// ── F4: Audit Log ──────────────────────────────────────────────────────────

app.get('/api/audit-log', requireAdmin, async (req, res) => {
  try {
    const { entityType, entityId, limit = '100', offset = '0' } = req.query;
    const entries = await listAuditLog({
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
    res.json({ entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

app.get('/api/vehicles/:vehicleId/audit-log', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const { limit = '100', offset = '0' } = req.query;
    const entries = await listAuditLog({
      entityId: req.params.vehicleId,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
    res.json({ entries });
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ── F7: Active Driver Check ────────────────────────────────────────────────

app.get('/api/vehicles/:vehicleId/drivers/active', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const driver = await getActiveDriver(req.params.vehicleId);
    res.json({ driver });
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to get active driver' });
  }
});

// ── F8: Fleet Performance Ranking ─────────────────────────────────────────

app.get('/api/fleet/performance-ranking', requireAuth, async (req, res) => {
  try {
    const ranking = await getFleetPerformanceRanking(req.user?.id, req.user?.role);
    res.json(ranking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute ranking' });
  }
});

// ── Driver Profile Update ──────────────────────────────────────────────────

app.patch('/api/vehicles/:vehicleId/drivers/:driverId/profile', requireAuth, async (req, res) => {
  try {
    await assertVehicleAccess(req.user, req.params.vehicleId);
    const updated = await updateDriverProfile(req.params.driverId, req.body, req.user?.id);
    res.json({ driver: updated });
  } catch (err) {
    if (err?.code === 'VEHICLE_ACCESS_DENIED') return res.status(403).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to update driver profile' });
  }
});

main().catch((err) => {
  console.error('Failed to start API:', err.message || err);
  console.error('Set DATABASE_URL in .env — see .env.example');
  process.exit(1);
});
