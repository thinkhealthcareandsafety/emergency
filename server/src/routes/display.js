import { Router } from 'express';
import { config } from '../config.js';
import { Property } from '../models/index.js';
import { requireDisplay } from '../middleware/auth.js';
import { buildSnapshot } from '../services/snapshot.js';

const router = Router();
router.use(requireDisplay);

router.get('/properties', async (req, res) => {
  const props = await Property.find().sort({ name: 1 }).select('code name').lean();
  res.json(props);
});

// QR target for the live-demo card on the wall screen. The punch key is shown to anyone in the room
// by design, so display-key holders may read it.
router.get('/:code/qr', (req, res) => {
  if (!config.demoPunch) return res.json({ enabled: false });
  res.json({ enabled: true, publicUrl: config.publicUrl || null, punchKey: config.demoPunchKey });
});

router.get('/:code', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await buildSnapshot(req.params.code));
});

export default router;
