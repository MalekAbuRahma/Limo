import { randomUUID } from 'crypto';
import { getPool } from './pgPool.js';
import {
  deleteVehicle,
  getVehicleState,
  saveVehicleState,
} from './db.js';
import { assertVehicleAccess } from './vehicleAccess.js';

export const DELETION_TYPES = [
  'entry',
  'oil_change',
  'accident',
  'license',
  'vehicle',
  'clear_all_entries',
];

function rowToRequest(row) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    vehicleLabel: row.vehicle_label || '',
    requestType: row.request_type,
    targetId: row.target_id || null,
    summary: row.summary || '',
    details: row.details ?? {},
    status: row.status,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name || '',
    requestedByUsername: row.requested_by_username || '',
    reviewedBy: row.reviewed_by || null,
    reviewedByName: row.reviewed_by_name || null,
    reviewNote: row.review_note || '',
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || null,
  };
}

const listSelect = `
  SELECT r.*,
    v.label AS vehicle_label,
    ru.display_name AS requested_by_name,
    ru.username AS requested_by_username,
    rv.display_name AS reviewed_by_name
  FROM deletion_requests r
  JOIN vehicles v ON v.id = r.vehicle_id
  JOIN users ru ON ru.id = r.requested_by
  LEFT JOIN users rv ON rv.id = r.reviewed_by
`;

export async function countPendingDeletionRequests() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM deletion_requests WHERE status = 'pending'`
  );
  return rows[0].c;
}

export async function listDeletionRequests(actor, { status = 'pending' } = {}) {
  const pool = getPool();
  const params = [];
  const clauses = [];

  if (status !== 'all') {
    clauses.push(`r.status = $${params.length + 1}`);
    params.push(status);
  }
  if (actor.role !== 'admin') {
    clauses.push(`r.requested_by = $${params.length + 1}`);
    params.push(actor.id);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `${listSelect} ${where} ORDER BY r.created_at ASC`,
    params
  );
  return rows.map(rowToRequest);
}

async function findPendingDuplicate(vehicleId, requestType, targetId, requestedBy) {
  const pool = getPool();
  if (requestType === 'clear_all_entries') {
    const { rows } = await pool.query(
      `SELECT id FROM deletion_requests
       WHERE vehicle_id = $1 AND request_type = $2 AND requested_by = $3 AND status = 'pending'`,
      [vehicleId, requestType, requestedBy]
    );
    return rows[0]?.id ?? null;
  }
  if (!targetId) return null;
  const { rows } = await pool.query(
    `SELECT id FROM deletion_requests
     WHERE vehicle_id = $1 AND request_type = $2 AND target_id = $3 AND status = 'pending'`,
    [vehicleId, requestType, targetId]
  );
  return rows[0]?.id ?? null;
}

export async function createDeletionRequest(actor, payload) {
  const vehicleId = String(payload.vehicleId ?? '').trim();
  const requestType = String(payload.requestType ?? '').trim();
  const targetId = payload.targetId ? String(payload.targetId).trim() : null;
  const summary = String(payload.summary ?? '').trim();
  const details = payload.details && typeof payload.details === 'object' ? payload.details : {};

  if (!vehicleId || !DELETION_TYPES.includes(requestType)) {
    throw Object.assign(new Error('Invalid deletion request'), { code: 'INVALID_REQUEST' });
  }
  if (!summary) {
    throw Object.assign(new Error('Summary is required'), { code: 'INVALID_REQUEST' });
  }
  if (requestType !== 'clear_all_entries' && requestType !== 'vehicle' && !targetId) {
    throw Object.assign(new Error('targetId is required'), { code: 'INVALID_REQUEST' });
  }

  await assertVehicleAccess(actor, vehicleId);

  const dup = await findPendingDuplicate(vehicleId, requestType, targetId, actor.id);
  if (dup) {
    throw Object.assign(new Error('A pending request already exists for this item'), {
      code: 'DUPLICATE_PENDING',
    });
  }

  const id = randomUUID();
  const pool = getPool();
  await pool.query(
    `INSERT INTO deletion_requests (
      id, vehicle_id, request_type, target_id, summary, details,
      status, requested_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW())`,
    [id, vehicleId, requestType, targetId, summary, JSON.stringify(details), actor.id]
  );

  const { rows } = await pool.query(`${listSelect} WHERE r.id = $1`, [id]);
  return rowToRequest(rows[0]);
}

export async function applyDeletion(vehicleId, requestType, targetId) {
  if (requestType === 'vehicle') {
    await deleteVehicle(vehicleId);
    return { vehicleDeleted: true };
  }

  const state = await getVehicleState(vehicleId);

  switch (requestType) {
    case 'entry':
      state.entries = state.entries.filter((e) => e.id !== targetId);
      state.oilChanges = state.oilChanges.filter((o) => o.entryId !== targetId);
      break;
    case 'oil_change':
      state.oilChanges = state.oilChanges.filter((o) => o.id !== targetId);
      break;
    case 'accident':
      state.accidents = state.accidents.filter((a) => a.id !== targetId);
      break;
    case 'license':
      state.licenses = state.licenses.filter((l) => l.id !== targetId);
      break;
    case 'clear_all_entries':
      state.entries = [];
      break;
    default:
      throw Object.assign(new Error('Unknown request type'), { code: 'INVALID_REQUEST' });
  }

  await saveVehicleState(vehicleId, state);
  return { vehicleDeleted: false };
}

export async function reviewDeletionRequest(requestId, reviewer, approve, reviewNote = '') {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM deletion_requests WHERE id = $1`,
    [requestId]
  );
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error('Request not found'), { code: 'NOT_FOUND' });
  }
  if (row.status !== 'pending') {
    throw Object.assign(new Error('Request already reviewed'), { code: 'ALREADY_REVIEWED' });
  }

  if (approve) {
    await assertVehicleAccess(reviewer, row.vehicle_id);
    await applyDeletion(row.vehicle_id, row.request_type, row.target_id);
  }

  await pool.query(
    `UPDATE deletion_requests SET
      status = $1,
      reviewed_by = $2,
      review_note = $3,
      reviewed_at = NOW()
    WHERE id = $4`,
    [approve ? 'approved' : 'rejected', reviewer.id, String(reviewNote ?? '').trim(), requestId]
  );

  const { rows: updated } = await pool.query(`${listSelect} WHERE r.id = $1`, [requestId]);
  return rowToRequest(updated[0]);
}
