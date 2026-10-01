import { config } from '../config.js';
import { getSettings } from '../services/settings.js';
import { processMany } from '../services/punches.js';
import { getPath } from '../services/parse.js';

/**
 * Polls HONO HR for attendance punches and feeds them into the live board.
 *
 * HONO (SequelOne) exposes attendance data to enterprise customers through its integration APIs;
 * the exact endpoint, auth scheme and field names are tenant-specific and must be obtained from
 * the client's HONO account manager. Everything below is driven by HONO_* env vars so wiring it up
 * is configuration, not code. If HONO can push instead (webhook), point it at /api/ingest/punch.
 */

const h = config.hono;
let running = false;
let timer = null;

function formatDate(d) {
  switch (h.dateFormat) {
    case 'epoch':
      return String(Math.floor(d.getTime() / 1000));
    case 'epochms':
      return String(d.getTime());
    case 'local': {
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
    default:
      return d.toISOString();
  }
}

function buildHeaders() {
  const headers = { Accept: 'application/json' };
  if (h.apiKey) headers[h.authHeader] = `${h.authPrefix}${h.apiKey}`;
  if (h.extraHeaders) {
    try {
      Object.assign(headers, JSON.parse(h.extraHeaders));
    } catch {
      console.warn('[hono] HONO_EXTRA_HEADERS is not valid JSON — ignored');
    }
  }
  return headers;
}

export async function runHonoSync() {
  if (running) return { skipped: true };
  running = true;
  const settings = await getSettings();
  const now = new Date();
  // Re-read an overlap window every time: biometric devices often sync into HONO late.
  // Duplicates are discarded by the punch store, so overlap is free.
  const cursor = settings.hono?.cursor || new Date(now - h.lookbackHours * 36e5);
  const since = new Date(Math.min(cursor.getTime(), now.getTime()) - h.overlapMinutes * 60000);

  try {
    const url = new URL(h.punchPath, h.baseUrl);
    const range = { [h.fromParam]: formatDate(since), [h.toParam]: formatDate(now) };
    const init = { method: h.method, headers: buildHeaders(), signal: AbortSignal.timeout(30000) };
    if (h.method === 'GET') {
      for (const [k, v] of Object.entries(range)) if (k) url.searchParams.set(k, v);
    } else {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(range);
    }

    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HONO responded HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const records = getPath(body, h.recordsPath);
    if (!Array.isArray(records)) throw new Error(`No array found at HONO_RECORDS_PATH="${h.recordsPath}"`);

    const summary = await processMany(records, {
      source: 'hono-api',
      fieldMap: { emp: h.fieldEmp, time: h.fieldTime, type: h.fieldType, property: h.fieldProperty },
      inValues: h.inValues,
      outValues: h.outValues,
    });

    settings.hono = { cursor: now, lastRunAt: now, lastOk: true, lastError: null, lastCount: records.length };
    await settings.save();
    if (summary.errors.length) console.warn(`[hono] ${summary.errors.length} rows rejected, e.g.`, summary.errors[0]);
    return summary;
  } catch (err) {
    console.error('[hono] Sync failed:', err.message);
    settings.hono = { ...(settings.hono?.toObject?.() ?? settings.hono), lastRunAt: now, lastOk: false, lastError: err.message };
    await settings.save();
    return { error: err.message };
  } finally {
    running = false;
  }
}

export function startHonoPoller() {
  if (!h.enabled) {
    console.log('[hono] Pull sync disabled (HONO_ENABLED=false). Webhook + CSV import still available.');
    return;
  }
  if (!h.baseUrl) {
    console.error('[hono] HONO_ENABLED=true but HONO_BASE_URL is empty — pull sync not started');
    return;
  }
  console.log(`[hono] Polling ${h.baseUrl}${h.punchPath} every ${h.pollSeconds}s`);
  runHonoSync();
  timer = setInterval(runHonoSync, h.pollSeconds * 1000);
  timer.unref?.();
}

export async function honoStatus() {
  const s = await getSettings();
  return {
    enabled: h.enabled,
    baseUrl: h.baseUrl || null,
    punchPath: h.punchPath,
    pollSeconds: h.pollSeconds,
    lastRunAt: s.hono?.lastRunAt || null,
    lastOk: s.hono?.lastOk ?? null,
    lastError: s.hono?.lastError || null,
    lastCount: s.hono?.lastCount ?? null,
    cursor: s.hono?.cursor || null,
  };
}
