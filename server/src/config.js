import 'dotenv/config';

// All attendance times are interpreted in the hotel's local timezone unless they carry an offset.
process.env.TZ ||= 'Asia/Kolkata';

const bool = (v, d = false) =>
  v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const list = (v, d) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : d);

const isProd = process.env.NODE_ENV === 'production';
const mongoUri = process.env.MONGO_URI || 'memory';

export const config = {
  isProd,
  port: num(process.env.PORT, 4000),
  mongoUri,
  tz: process.env.TZ,
  dateOrder: (process.env.DATE_ORDER || 'DMY').toUpperCase(), // how to read 01/10/2026 in CSVs

  jwtSecret: process.env.JWT_SECRET || 'dev-only-jwt-secret-change-me',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  displayKey: process.env.DISPLAY_KEY || 'display-dev-key',
  // Demo/kiosk: let anyone open the wall screen without ?key=. Admin and webhook stay protected.
  displayPublic: bool(process.env.DISPLAY_PUBLIC, false),
  ingestApiKey: process.env.INGEST_API_KEY || 'ingest-dev-key',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  defaultProperty: (process.env.DEFAULT_PROPERTY || 'MAIN').toUpperCase(),
  defaultPropertyName: process.env.DEFAULT_PROPERTY_NAME || 'Main Property',
  staleAfterHours: num(process.env.STALE_AFTER_HOURS, 14),
  autoCreateUnknown: bool(process.env.AUTO_CREATE_UNKNOWN, true),

  // Public base URL (e.g. https://ert.example.com or a tunnel URL) used for QR codes and webhook hints.
  // Render sets RENDER_EXTERNAL_URL automatically, so QR codes work there without extra config.
  publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
  // QR "punch from your phone" page for live demos. Off by default outside demo mode.
  demoPunch: bool(process.env.DEMO_PUNCH, mongoUri === 'memory'),
  demoPunchKey: process.env.DEMO_PUNCH_KEY || 'demo-punch-key',


  // HONO HR pull integration. Endpoint paths and field names MUST be confirmed with HONO
  // (SequelOne) for the client's tenant — everything is configurable so no code change is needed.
  hono: {
    enabled: bool(process.env.HONO_ENABLED, false),
    baseUrl: process.env.HONO_BASE_URL || '',
    punchPath: process.env.HONO_PUNCH_PATH || '/api/attendance/punches',
    method: (process.env.HONO_METHOD || 'GET').toUpperCase(),
    authHeader: process.env.HONO_AUTH_HEADER || 'Authorization',
    authPrefix: process.env.HONO_AUTH_PREFIX ?? 'Bearer ',
    apiKey: process.env.HONO_API_KEY || '',
    extraHeaders: process.env.HONO_EXTRA_HEADERS || '', // JSON, e.g. {"x-tenant-id":"abc"}
    fromParam: process.env.HONO_FROM_PARAM || 'from',
    toParam: process.env.HONO_TO_PARAM || 'to',
    dateFormat: process.env.HONO_DATE_FORMAT || 'iso', // iso | epoch | epochms | local
    recordsPath: process.env.HONO_RECORDS_PATH || 'data',
    fieldEmp: process.env.HONO_FIELD_EMP || 'employeeCode',
    fieldTime: process.env.HONO_FIELD_TIME || 'punchTime',
    fieldType: process.env.HONO_FIELD_TYPE || 'punchType',
    fieldProperty: process.env.HONO_FIELD_PROPERTY || 'location',
    inValues: list(process.env.HONO_IN_VALUES, []),
    outValues: list(process.env.HONO_OUT_VALUES, []),
    pollSeconds: num(process.env.HONO_POLL_SECONDS, 60),
    lookbackHours: num(process.env.HONO_LOOKBACK_HOURS, 24),
    overlapMinutes: num(process.env.HONO_OVERLAP_MINUTES, 60),
  },
};

if (isProd) {
  const weak = [];
  if (config.jwtSecret.startsWith('dev-only')) weak.push('JWT_SECRET');
  if (config.adminPassword === 'admin123') weak.push('ADMIN_PASSWORD');
  if (config.displayKey === 'display-dev-key') weak.push('DISPLAY_KEY');
  if (config.ingestApiKey === 'ingest-dev-key') weak.push('INGEST_API_KEY');
  if (config.demoPunch && config.demoPunchKey === 'demo-punch-key') weak.push('DEMO_PUNCH_KEY');
  if (weak.length) {
    console.error(`[config] Refusing to start in production with default secrets: ${weak.join(', ')}`);
    process.exit(1);
  }
}
