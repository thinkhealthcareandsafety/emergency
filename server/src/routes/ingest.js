import { Router } from 'express';
import { requireIngestKey } from '../middleware/auth.js';
import { processMany } from '../services/punches.js';

/**
 * Push endpoint for HONO webhooks, an integration middleware, or a biometric bridge.
 *
 *   POST /api/ingest/punch
 *   x-api-key: <INGEST_API_KEY>
 *   { "employeeCode": "E1001", "punchTime": "2026-10-01T09:02:00+05:30", "punchType": "IN" }
 *
 * Also accepts an array, or { "punches": [...] } / { "data": [...] }. Field names are matched loosely.
 */
const router = Router();
router.use(requireIngestKey);

router.post('/punch', async (req, res) => {
  const body = req.body;
  const records = Array.isArray(body) ? body : body?.punches || body?.data || body?.records || [body];
  if (!records.length || records.length > 5000) {
    return res.status(400).json({ error: 'Send between 1 and 5000 punches per request' });
  }
  const source = String(req.headers['x-source'] || 'webhook').slice(0, 40);
  const summary = await processMany(records, { source });
  res.status(summary.errors.length && summary.errors.length === records.length ? 400 : 200).json(summary);
});

export default router;
