import { config } from './config.js';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { initRealtime } from './services/realtime.js';
import { getSettings } from './services/settings.js';
import { ensureAdmin, ensureDefaultProperty } from './seed.js';
import { startHonoPoller } from './integrations/hono.js';
import authRoutes from './routes/auth.js';
import displayRoutes from './routes/display.js';
import ingestRoutes from './routes/ingest.js';
import adminRoutes from './routes/admin.js';
import demoRoutes from './routes/demo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) =>
  res.json({ ok: mongoose.connection.readyState === 1, time: new Date(), tz: config.tz })
);
app.use('/api/auth', authRoutes);
app.use('/api/display', displayRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// In production the built React app is served from the same origin.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get(/.*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
});

const server = http.createServer(app);
initRealtime(server, config.corsOrigin);

await connectDb(config.mongoUri);
await getSettings();
await ensureAdmin();
await ensureDefaultProperty();
startHonoPoller();

server.listen(config.port, () => {
  console.log(`[ert] Server on http://localhost:${config.port}  (TZ ${config.tz})`);
  if (config.publicUrl) console.log(`[ert] Public URL ${config.publicUrl}`);
  if (config.demoPunch) console.log('[ert] Live-demo QR punching is ON');
});
