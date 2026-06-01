import { extractBearerToken, validateSession } from './auth.js';

const authDisabled = () => process.env.AUTH_DISABLED === '1';

export async function requireAuth(req, res, next) {
  if (authDisabled()) {
    req.user = { id: 'local', username: 'local', displayName: 'Local', role: 'admin', active: true };
    return next();
  }

  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const user = await validateSession(token);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
    req.user = user;
    req.authToken = token;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Auth check failed' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') {
    next();
    return;
  }
  res.status(403).json({ error: 'Admin access required' });
}

export function requireAdminForDestructive(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  if (req.user?.role === 'admin') {
    next();
    return;
  }
  res.status(403).json({ error: 'Only administrators can perform this action' });
}
