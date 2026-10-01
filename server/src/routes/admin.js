import { Router } from 'express';
import multer from 'multer';
import { Emergency, Employee, Property, PunchEvent } from '../models/index.js';
import { requireAdmin } from '../middleware/auth.js';
import { config } from '../config.js';
import { availabilityOf } from '../services/availability.js';
import { getSettings } from '../services/settings.js';
import { HttpError, processMany, processPunch } from '../services/punches.js';
import { ALIASES, normalizeRow, parseCsv, pick } from '../services/parse.js';
import { notifyAll, notifyProperty } from '../services/realtime.js';
import { buildMuster } from '../services/snapshot.js';
import { honoStatus, runHonoSync } from '../integrations/hono.js';

const router = Router();
router.use(requireAdmin);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const EMP_FIELDS = ['empCode', 'name', 'designation', 'department', 'propertyCode', 'ertRoles', 'phone', 'photoUrl', 'active'];

function cleanEmployee(body) {
  const out = {};
  for (const f of EMP_FIELDS) if (body[f] !== undefined) out[f] = body[f];
  if (typeof out.ertRoles === 'string') out.ertRoles = out.ertRoles.split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
  if (out.propertyCode) out.propertyCode = String(out.propertyCode).toUpperCase();
  return out;
}

async function findEmployee(empCode) {
  const emp = await Employee.findOne({ empCode });
  if (!emp) throw new HttpError(404, `Employee ${empCode} not found`);
  return emp;
}

// ---------- Employees ----------

router.get('/employees', async (req, res) => {
  const q = {};
  if (req.query.property) q.propertyCode = String(req.query.property).toUpperCase();
  const [employees, settings] = await Promise.all([Employee.find(q).sort({ name: 1 }).lean(), getSettings()]);
  const now = new Date();
  res.json(employees.map((e) => ({ ...e, availability: availabilityOf(e, now, settings.staleAfterHours) })));
});

router.post('/employees', async (req, res) => {
  const data = cleanEmployee(req.body || {});
  if (!data.empCode || !data.name) throw new HttpError(400, 'Employee code and name are required');
  data.propertyCode ||= config.defaultProperty;
  if (await Employee.exists({ empCode: data.empCode })) throw new HttpError(409, `Employee code ${data.empCode} already exists`);
  const emp = await Employee.create(data);
  notifyProperty(emp.propertyCode);
  res.status(201).json(emp);
});

router.put('/employees/:empCode', async (req, res) => {
  const emp = await findEmployee(req.params.empCode);
  const before = emp.propertyCode;
  const data = cleanEmployee(req.body || {});
  delete data.empCode;
  Object.assign(emp, data, { autoCreated: false });
  await emp.save();
  notifyProperty(before);
  notifyProperty(emp.propertyCode);
  res.json(emp);
});

router.delete('/employees/:empCode', async (req, res) => {
  const emp = await findEmployee(req.params.empCode);
  await emp.deleteOne();
  notifyProperty(emp.propertyCode);
  res.json({ ok: true });
});

router.post('/employees/import', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Attach a CSV file');
  const rows = parseCsv(req.file.buffer);
  const result = { total: rows.length, created: 0, updated: 0, errors: [] };
  for (const [i, raw] of rows.entries()) {
    const r = normalizeRow(raw);
    const empCode = pick(r, ALIASES.emp);
    const name = pick(r, ['name', 'employeeName', 'fullName']);
    if (!empCode || !name) {
      result.errors.push({ row: i + 2, error: 'Missing employee code or name' });
      continue;
    }
    const data = cleanEmployee({
      empCode: String(empCode),
      name,
      designation: pick(r, ['designation', 'title', 'jobTitle']),
      department: pick(r, ['department', 'dept']),
      propertyCode: pick(r, ALIASES.property) || config.defaultProperty,
      ertRoles: pick(r, ['ertRoles', 'ertRole', 'roles', 'role']) || '',
      phone: pick(r, ['phone', 'mobile', 'mobileNo', 'contact']),
    });
    const existing = await Employee.findOne({ empCode: data.empCode });
    if (existing) {
      Object.assign(existing, data, { autoCreated: false });
      await existing.save();
      result.updated++;
    } else {
      await Employee.create(data);
      result.created++;
    }
  }
  notifyAll();
  res.json(result);
});

// ---------- Manual status & corrections ----------

router.post('/employees/:empCode/override', async (req, res) => {
  const emp = await findEmployee(req.params.empCode);
  const { status, reason, minutes } = req.body || {};
  if (!['AVAILABLE', 'UNAVAILABLE'].includes(status)) throw new HttpError(400, 'status must be AVAILABLE or UNAVAILABLE');
  const mins = Number(minutes);
  emp.override = {
    status,
    reason: reason ? String(reason).slice(0, 80) : undefined,
    until: mins > 0 ? new Date(Date.now() + mins * 60000) : undefined,
    by: req.user.username,
    at: new Date(),
  };
  await emp.save();
  notifyProperty(emp.propertyCode);
  res.json(emp);
});

router.delete('/employees/:empCode/override', async (req, res) => {
  const emp = await findEmployee(req.params.empCode);
  emp.override = null;
  await emp.save();
  notifyProperty(emp.propertyCode);
  res.json(emp);
});

router.post('/punch', async (req, res) => {
  const { empCode, type, at } = req.body || {};
  if (!['IN', 'OUT'].includes(type)) throw new HttpError(400, 'type must be IN or OUT');
  res.json(await processPunch({ empCode, type, at, source: `manual:${req.user.username}` }));
});

router.post('/punches/import', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Attach a CSV file');
  const rows = parseCsv(req.file.buffer);
  res.json(await processMany(rows, { source: 'csv-import' }));
});

/** Punch log with employee names. ?date=YYYY-MM-DD limits to that day in the server timezone. */
router.get('/punches', async (req, res) => {
  const q = {};
  if (req.query.property) q.propertyCode = String(req.query.property).toUpperCase();
  if (req.query.empCode) q.empCode = String(req.query.empCode);
  if (req.query.date) {
    const m = String(req.query.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) throw new HttpError(400, 'date must be YYYY-MM-DD');
    const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    q.at = { $gte: start, $lt: end };
  }
  const limit = Math.min(Number(req.query.limit) || 500, 2000);
  const punches = await PunchEvent.find(q).sort({ at: -1 }).limit(limit).select('-raw').lean();
  const employees = await Employee.find({ empCode: { $in: [...new Set(punches.map((p) => p.empCode))] } })
    .select('empCode name designation department ertRoles')
    .lean();
  const byCode = new Map(employees.map((e) => [e.empCode, e]));
  res.json(
    punches.map((p) => {
      const e = byCode.get(p.empCode);
      return {
        id: String(p._id),
        empCode: p.empCode,
        name: e?.name || p.empCode,
        designation: e?.designation || '',
        department: e?.department || '',
        ertRoles: e?.ertRoles || [],
        type: p.type,
        at: p.at,
        source: p.source,
        propertyCode: p.propertyCode,
      };
    })
  );
});

// ---------- Settings / roles ----------

router.get('/settings', async (req, res) => res.json(await getSettings()));

router.put('/settings', async (req, res) => {
  const s = await getSettings();
  const { roles, staleAfterHours } = req.body || {};
  if (Array.isArray(roles)) {
    const keys = new Set();
    s.roles = roles.map((r, i) => {
      const key = String(r.key || r.label || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
      if (!key || keys.has(key)) throw new HttpError(400, `Role keys must be unique and non-empty (${r.label})`);
      keys.add(key);
      return { key, label: String(r.label || key), color: r.color || '#94a3b8', minOnDuty: Math.max(0, Number(r.minOnDuty) || 0), order: i + 1 };
    });
  }
  if (staleAfterHours !== undefined) {
    const h = Number(staleAfterHours);
    if (!(h >= 1 && h <= 72)) throw new HttpError(400, 'Stale threshold must be between 1 and 72 hours');
    s.staleAfterHours = h;
  }
  await s.save();
  notifyAll();
  res.json(s);
});

// ---------- Properties ----------

router.get('/properties', async (req, res) => res.json(await Property.find().sort({ name: 1 }).lean()));

router.post('/properties', async (req, res) => {
  const { code, name, address, assemblyPoint, emergencyContacts } = req.body || {};
  if (!code || !name) throw new HttpError(400, 'Code and name are required');
  if (await Property.exists({ code: String(code).toUpperCase() })) throw new HttpError(409, 'Property code already exists');
  res.status(201).json(await Property.create({ code, name, address, assemblyPoint, emergencyContacts }));
});

router.put('/properties/:code', async (req, res) => {
  const p = await Property.findOne({ code: req.params.code.toUpperCase() });
  if (!p) throw new HttpError(404, 'Property not found');
  const { name, address, assemblyPoint, emergencyContacts } = req.body || {};
  Object.assign(p, { name: name ?? p.name, address, assemblyPoint, emergencyContacts: emergencyContacts ?? p.emergencyContacts });
  await p.save();
  notifyProperty(p.code);
  res.json(p);
});

// ---------- Emergency / muster ----------

router.get('/emergency/:code', async (req, res) => res.json(await buildMuster(req.params.code)));

router.post('/emergency/:code/start', async (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!(await Property.exists({ code }))) throw new HttpError(404, 'Property not found');
  const active = await Emergency.findOne({ propertyCode: code, endedAt: null });
  if (active) throw new HttpError(409, 'An emergency is already active for this property');
  const { type, note } = req.body || {};
  const e = await Emergency.create({ propertyCode: code, type: type || 'Emergency', note, startedBy: req.user.username });
  notifyProperty(code);
  res.status(201).json(e);
});

router.post('/emergency/:code/end', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const e = await Emergency.findOne({ propertyCode: code, endedAt: null });
  if (!e) throw new HttpError(404, 'No active emergency');
  e.endedAt = new Date();
  e.endedBy = req.user.username;
  await e.save();
  notifyProperty(code);
  res.json(e);
});

router.post('/emergency/:code/account', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { empCode, accounted } = req.body || {};
  const e = await Emergency.findOne({ propertyCode: code, endedAt: null });
  if (!e) throw new HttpError(404, 'No active emergency');
  e.accounted = e.accounted.filter((a) => a.empCode !== empCode);
  if (accounted) e.accounted.push({ empCode, at: new Date(), by: req.user.username });
  await e.save();
  notifyProperty(code);
  res.json({ ok: true });
});

router.get('/emergencies', async (req, res) => {
  res.json(await Emergency.find().sort({ startedAt: -1 }).limit(50).lean());
});

// ---------- Live demo (QR punching) ----------

router.get('/demo', async (req, res) => {
  res.json({
    enabled: config.demoPunch,
    publicUrl: config.publicUrl || null,
    punchKey: config.demoPunch ? config.demoPunchKey : null,
    visitors: await Employee.countDocuments({ demoVisitor: true }),
  });
});

router.delete('/demo/visitors', async (req, res) => {
  const visitors = await Employee.find({ demoVisitor: true }).select('empCode').lean();
  const codes = visitors.map((v) => v.empCode);
  await Promise.all([Employee.deleteMany({ empCode: { $in: codes } }), PunchEvent.deleteMany({ empCode: { $in: codes } })]);
  notifyAll();
  res.json({ removed: codes.length });
});

// ---------- Integration ----------

router.get('/integration', async (req, res) => {
  res.json({
    hono: await honoStatus(),
    webhook: {
      url: `${config.publicUrl || `${req.protocol}://${req.get('host')}`}/api/ingest/punch`,
      header: 'x-api-key',
      keyHint: `${config.ingestApiKey.slice(0, 4)}…${config.ingestApiKey.slice(-2)}`,
    },
    displayKeyHint: `${config.displayKey.slice(0, 4)}…`,
    staleAfterHours: (await getSettings()).staleAfterHours,
    timezone: config.tz,
  });
});

router.post('/integration/hono/sync', async (req, res) => {
  if (!config.hono.enabled) throw new HttpError(400, 'HONO sync is not enabled (set HONO_ENABLED=true)');
  res.json(await runHonoSync());
});

export default router;
