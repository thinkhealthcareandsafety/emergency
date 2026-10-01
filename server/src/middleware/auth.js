import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function userFromRequest(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(h.slice(7), config.jwtSecret);
  } catch {
    return null;
  }
}

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), username: user.username, role: user.role }, config.jwtSecret, {
    expiresIn: '12h',
  });
}

export function requireAdmin(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please sign in' });
  req.user = user;
  next();
}

/** Wall screens use a read-only display key (?key=...); signed-in admins can view too. */
export function requireDisplay(req, res, next) {
  if (config.displayPublic) return next();
  const key = req.query.key || req.headers['x-display-key'];
  if (key && safeEqual(key, config.displayKey)) return next();
  const user = userFromRequest(req);
  if (user) {
    req.user = user;
    return next();
  }
  res.status(401).json({ error: 'Invalid display key' });
}

/** Machine-to-machine: HONO webhooks, middleware, biometric bridges. */
export function requireIngestKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (key && safeEqual(key, config.ingestApiKey)) return next();
  res.status(401).json({ error: 'Invalid API key' });
}
