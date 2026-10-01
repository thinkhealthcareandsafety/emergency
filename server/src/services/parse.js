import { parse } from 'csv-parse/sync';
import { config } from '../config.js';

export const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Lower-cases and strips punctuation from keys so "Employee Code", "employee_code" and "employeeCode" all match. */
export function normalizeRow(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[normKey(k)] = typeof v === 'string' ? v.trim() : v;
  return out;
}

export function pick(row, aliases) {
  for (const a of aliases) {
    if (!a) continue;
    const v = row[normKey(a)];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function parseCsv(buffer) {
  return parse(buffer, {
    columns: (header) => header.map(normKey),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });
}

export const ALIASES = {
  emp: ['empCode', 'employeeCode', 'employeeId', 'empId', 'employeeNo', 'empNo', 'staffId', 'code', 'id'],
  time: ['at', 'punchTime', 'punchDateTime', 'timestamp', 'dateTime', 'logTime', 'time', 'punch'],
  date: ['date', 'punchDate', 'attendanceDate', 'logDate'],
  type: ['type', 'punchType', 'direction', 'inOut', 'mode', 'status', 'event'],
  property: ['propertyCode', 'property', 'location', 'site', 'branch', 'hotel', 'unit'],
};

const IN_WORDS = new Set(['in', 'i', 'checkin', 'punchin', 'clockin', 'entry', 'login', 'signin']);
const OUT_WORDS = new Set(['out', 'o', 'checkout', 'punchout', 'clockout', 'exit', 'logout', 'signout']);

export function normalizeType(v, extraIn = [], extraOut = []) {
  if (v === undefined || v === null || v === '') return null;
  const raw = String(v).trim();
  if (extraIn.includes(raw)) return 'IN';
  if (extraOut.includes(raw)) return 'OUT';
  const s = normKey(raw);
  if (IN_WORDS.has(s)) return 'IN';
  if (OUT_WORDS.has(s)) return 'OUT';
  return null;
}

const DATE_RE =
  /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/;
const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/;

function to24h(h, ap) {
  h = Number(h);
  if (!ap) return h;
  const pm = ap.toLowerCase() === 'pm';
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

/**
 * Parses the date formats Indian HRMS exports actually produce:
 * ISO, "01-10-2026 09:05", "01/10/2026 9:05 AM", epoch seconds/ms, or separate date + time columns.
 * Naive times are read in the server timezone (TZ, default Asia/Kolkata).
 */
export function parseDateTime(value, dateOnly) {
  if (value instanceof Date) return isNaN(value) ? null : value;
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  let s = String(value ?? '').trim();
  const d0 = String(dateOnly ?? '').trim();

  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
  if (/^\d{13}$/.test(s)) return new Date(Number(s));

  // Separate date and time columns
  const t = s.match(TIME_ONLY_RE);
  if (t && d0) {
    const base = parseDateTime(d0);
    if (!base) return null;
    base.setHours(to24h(t[1], t[4]), Number(t[2]), Number(t[3] || 0), 0);
    return base;
  }
  if (!s) s = d0;
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T'));
    return isNaN(d) ? null : d;
  }

  const m = s.match(DATE_RE);
  if (m) {
    const [, a, b, yRaw, hh = '0', mm = '0', ss = '0', ap] = m;
    const [day, mon] = config.dateOrder === 'MDY' ? [b, a] : [a, b];
    let y = Number(yRaw);
    if (y < 100) y += 2000;
    const d = new Date(y, Number(mon) - 1, Number(day), to24h(hh, ap), Number(mm), Number(ss));
    return isNaN(d) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function getPath(obj, path) {
  if (!path) return obj;
  return String(path)
    .split('.')
    .reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}
