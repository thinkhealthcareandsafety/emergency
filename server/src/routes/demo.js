import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { Employee, Property } from '../models/index.js';
import { safeEqual } from '../middleware/auth.js';
import { availabilityOf } from '../services/availability.js';
import { getSettings } from '../services/settings.js';
import { HttpError, processPunch } from '../services/punches.js';

/**
 * Live-demo punching: people in a meeting scan a QR code, enter their name and punch in from
 * their phone. Punches go through the same processPunch() pipeline as HONO webhook/API punches,
 * so the wall screen reacts exactly as it will in production.
 *
 * Protected by DEMO_PUNCH_KEY (embedded in the QR), rate limited per IP, and capped in size.
 */
const router = Router();
const MAX_VISITORS = 200;
// Generous on purpose: everyone in a meeting room usually shares one Wi-Fi/NAT address.
const PER_MINUTE = 120;
const hits = new Map();

function guard(req, res, next) {
  if (!config.demoPunch) return res.status(404).json({ error: 'Live demo punching is turned off' });
  if (!safeEqual(req.query.k, config.demoPunchKey)) {
    return res.status(401).json({ error: 'This QR code is not valid any more. Please scan the code on the screen again.' });
  }
  next();
}

function rateLimit(req, res, next) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= PER_MINUTE) return res.status(429).json({ error: 'Too many taps. Please wait a moment.' });
  recent.push(now);
  hits.set(req.ip, recent);
  next();
}

async function findProperty(code) {
  const property = await Property.findOne({ code: String(code).toUpperCase() }).lean();
  if (!property) throw new HttpError(404, 'Unknown property');
  return property;
}

router.get('/:code', guard, async (req, res) => {
  const property = await findProperty(req.params.code);
  const settings = await getSettings();
  let me = null;
  if (req.query.v) {
    const e = await Employee.findOne({ empCode: String(req.query.v), demoVisitor: true }).lean();
    if (e) {
      me = {
        visitorId: e.empCode,
        name: e.name,
        role: e.ertRoles[0] || '',
        state: availabilityOf(e, new Date(), settings.staleAfterHours).state,
        lastPunchAt: e.lastPunchAt,
      };
    }
  }
  res.json({
    property: { code: property.code, name: property.name },
    roles: [...settings.roles].sort((a, b) => a.order - b.order).map(({ key, label, color }) => ({ key, label, color })),
    me,
  });
});

router.post('/:code/punch', guard, rateLimit, async (req, res) => {
  const property = await findProperty(req.params.code);
  const { visitorId, type } = req.body || {};
  const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const role = String(req.body?.role || '');
  if (!['IN', 'OUT'].includes(type)) throw new HttpError(400, 'type must be IN or OUT');
  if (name.length < 2) throw new HttpError(400, 'Please enter your name');

  const settings = await getSettings();
  if (role && !settings.roles.some((r) => r.key === role)) throw new HttpError(400, 'Unknown role');

  let emp = visitorId ? await Employee.findOne({ empCode: String(visitorId), demoVisitor: true }) : null;
  if (!emp) {
    if ((await Employee.countDocuments({ demoVisitor: true })) >= MAX_VISITORS) {
      throw new HttpError(429, 'The demo is full. Ask the presenter to reset it.');
    }
    emp = await Employee.create({
      empCode: `V-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      name,
      designation: 'Demo visitor',
      propertyCode: property.code,
      ertRoles: role ? [role] : [],
      demoVisitor: true,
    });
  } else {
    emp.name = name;
    emp.ertRoles = role ? [role] : [];
    emp.propertyCode = property.code;
    await emp.save();
  }

  const result = await processPunch({ empCode: emp.empCode, type, source: 'qr-demo', propertyCode: property.code });
  res.json({ visitorId: emp.empCode, ...result });
});

export default router;
