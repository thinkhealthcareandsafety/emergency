import { Emergency, Employee, Property, PunchEvent } from '../models/index.js';
import { availabilityOf } from './availability.js';
import { getSettings } from './settings.js';
import { HttpError } from './punches.js';

const STATE_ORDER = { available: 0, stale: 1, unavailable: 2, off: 3 };

/** Everything a live screen needs for one property, in one request. */
export async function buildSnapshot(propertyCode) {
  const code = String(propertyCode).toUpperCase();
  const now = new Date();
  const [property, settings, employees, recent, emergency] = await Promise.all([
    Property.findOne({ code }).lean(),
    getSettings(),
    Employee.find({ propertyCode: code, active: true }).lean(),
    PunchEvent.find({ propertyCode: code }).sort({ at: -1 }).limit(12).lean(),
    Emergency.findOne({ propertyCode: code, endedAt: null }).sort({ startedAt: -1 }).lean(),
  ]);
  if (!property) throw new HttpError(404, `Unknown property ${code}`);

  const staleH = settings.staleAfterHours;
  const roles = [...settings.roles].sort((a, b) => a.order - b.order);
  const accounted = new Set((emergency?.accounted || []).map((a) => a.empCode));

  const withState = employees.map((e) => ({ e, a: availabilityOf(e, now, staleH) }));

  const members = withState
    .filter(({ e }) => e.ertRoles?.length)
    .map(({ e, a }) => ({
      empCode: e.empCode,
      name: e.name,
      designation: e.designation,
      department: e.department,
      phone: e.phone,
      photoUrl: e.photoUrl,
      ertRoles: e.ertRoles,
      lastPunchType: e.lastPunchType,
      lastPunchAt: e.lastPunchAt,
      accounted: accounted.has(e.empCode),
      ...a,
    }))
    .sort((x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state] || x.name.localeCompare(y.name));

  const coverage = roles.map((r) => {
    const available = members.filter((m) => m.state === 'available' && m.ertRoles.includes(r.key)).length;
    return { key: r.key, label: r.label, color: r.color, required: r.minOnDuty, available, ok: available >= r.minOnDuty };
  });

  const onSite = withState.filter(({ a }) => a.state === 'available');
  const unconfirmed = withState.filter(({ a }) => a.state === 'stale');
  const names = new Map(employees.map((e) => [e.empCode, e.name]));

  return {
    generatedAt: now,
    property: {
      code: property.code,
      name: property.name,
      address: property.address,
      assemblyPoint: property.assemblyPoint,
      emergencyContacts: property.emergencyContacts || [],
    },
    roles: roles.map(({ key, label, color }) => ({ key, label, color })),
    coverage,
    members,
    stats: {
      ertTotal: members.length,
      ertAvailable: members.filter((m) => m.state === 'available').length,
      staffOnSite: onSite.length,
      staffUnconfirmed: unconfirmed.length,
      rolesShort: coverage.filter((c) => !c.ok).length,
    },
    // Latest punches for the on-screen log (who punched in / out, and when).
    recent: recent.map((p) => ({
      id: String(p._id),
      empCode: p.empCode,
      name: names.get(p.empCode) || p.empCode,
      type: p.type,
      at: p.at,
    })),
    emergency: emergency
      ? {
          id: String(emergency._id),
          type: emergency.type,
          note: emergency.note,
          startedAt: emergency.startedAt,
          startedBy: emergency.startedBy,
          accountedCount: [...accounted].filter((c) => onSite.some(({ e }) => e.empCode === c)).length,
          toAccount: onSite.length,
        }
      : null,
  };
}

/** Full on-site list for the muster (headcount) screen during an emergency. */
export async function buildMuster(propertyCode) {
  const code = String(propertyCode).toUpperCase();
  const now = new Date();
  const [settings, employees, emergency] = await Promise.all([
    getSettings(),
    Employee.find({ propertyCode: code, active: true }).lean(),
    Emergency.findOne({ propertyCode: code, endedAt: null }).sort({ startedAt: -1 }).lean(),
  ]);
  const accounted = new Map((emergency?.accounted || []).map((a) => [a.empCode, a]));
  const people = employees
    .map((e) => ({ e, a: availabilityOf(e, now, settings.staleAfterHours) }))
    .filter(({ a }) => a.state === 'available' || a.state === 'stale')
    .map(({ e, a }) => ({
      empCode: e.empCode,
      name: e.name,
      designation: e.designation,
      department: e.department,
      phone: e.phone,
      ertRoles: e.ertRoles,
      state: a.state,
      accounted: accounted.has(e.empCode),
      accountedAt: accounted.get(e.empCode)?.at || null,
    }))
    .sort((x, y) => Number(x.accounted) - Number(y.accounted) || x.name.localeCompare(y.name));
  return { emergency, people };
}
