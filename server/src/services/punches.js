import { Employee, PunchEvent } from '../models/index.js';
import { config } from '../config.js';
import { notifyProperty } from './realtime.js';
import { ALIASES, normalizeRow, normalizeType, parseDateTime, pick } from './parse.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Records one attendance punch and updates the employee's live status.
 * Idempotent: the same employee + timestamp is only stored once, so HONO re-syncs and
 * overlapping CSV uploads are safe. Out-of-order punches are stored but never roll status backwards.
 */
export async function processPunch({ empCode, type, at, source = 'unknown', propertyCode, raw }) {
  empCode = String(empCode ?? '').trim();
  if (!empCode) throw new HttpError(400, 'empCode is required');

  const when = at === undefined || at === null || at === '' ? new Date() : parseDateTime(at);
  if (!when) throw new HttpError(400, `Invalid punch time: ${at}`);
  if (when.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new HttpError(400, `Punch time is in the future: ${when.toISOString()}`);
  }

  let emp = await Employee.findOne({ empCode });
  if (!emp) {
    if (!config.autoCreateUnknown) return { empCode, status: 'ignored', reason: 'unknown employee' };
    emp = await Employee.create({
      empCode,
      name: `Employee ${empCode}`,
      propertyCode: String(propertyCode || config.defaultProperty).toUpperCase(),
      autoCreated: true,
    });
  }

  // Devices that don't report direction: alternate based on the current state.
  let resolved = typeof type === 'string' && ['IN', 'OUT'].includes(type) ? type : normalizeType(type);
  if (!resolved) resolved = emp.lastPunchType === 'IN' && emp.lastPunchAt < when ? 'OUT' : 'IN';

  const isNewer = !emp.lastPunchAt || when >= emp.lastPunchAt;
  try {
    await PunchEvent.create({
      empCode,
      propertyCode: String(propertyCode || emp.propertyCode).toUpperCase(),
      type: resolved,
      at: when,
      source,
      dedupeKey: `${empCode}|${when.getTime()}`,
      applied: isNewer,
      raw,
    });
  } catch (err) {
    if (err.code === 11000) return { empCode, status: 'duplicate' };
    throw err;
  }

  if (isNewer) {
    emp.lastPunchType = resolved;
    emp.lastPunchAt = when;
    emp.lastPunchSource = source;
    emp.override = null; // a fresh real punch always beats a stale manual status
    await emp.save();
  }
  notifyProperty(emp.propertyCode);
  return { empCode, status: isNewer ? 'applied' : 'recorded', type: resolved, at: when };
}

/** Accepts any reasonably-shaped record (JSON webhook body or CSV row) and maps it to a punch. */
export function recordToPunch(record, { source, fieldMap = {}, inValues = [], outValues = [] } = {}) {
  const row = normalizeRow(record);
  const empCode = pick(row, [fieldMap.emp, ...ALIASES.emp]);
  const time = pick(row, [fieldMap.time, ...ALIASES.time]);
  const date = pick(row, [fieldMap.date, ...ALIASES.date]);
  const typeRaw = pick(row, [fieldMap.type, ...ALIASES.type]);
  const propertyCode = pick(row, [fieldMap.property, ...ALIASES.property]);
  const at = time !== undefined || date !== undefined ? parseDateTime(time, date) : undefined;
  if ((time !== undefined || date !== undefined) && !at) {
    throw new HttpError(400, `Could not read punch time "${time ?? ''} ${date ?? ''}"`.trim());
  }
  return {
    empCode,
    type: normalizeType(typeRaw, inValues, outValues),
    at,
    propertyCode,
    source,
    raw: record,
  };
}

/** Processes many records, never failing the whole batch for one bad row. */
export async function processMany(records, opts) {
  const summary = { total: records.length, applied: 0, recorded: 0, duplicate: 0, ignored: 0, errors: [] };
  // Oldest first so the final state reflects the latest punch.
  const punches = [];
  records.forEach((r, i) => {
    try {
      punches.push({ i, p: recordToPunch(r, opts) });
    } catch (e) {
      summary.errors.push({ row: i + 1, error: e.message });
    }
  });
  punches.sort((a, b) => (a.p.at?.getTime() ?? 0) - (b.p.at?.getTime() ?? 0));
  for (const { i, p } of punches) {
    try {
      const r = await processPunch(p);
      summary[r.status] = (summary[r.status] || 0) + 1;
    } catch (e) {
      summary.errors.push({ row: i + 1, error: e.message });
    }
  }
  summary.errors = summary.errors.slice(0, 50);
  return summary;
}
