import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { signToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Very small in-memory brute-force guard: 10 failed attempts per IP per 15 minutes.
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;

router.post('/login', async (req, res) => {
  const ip = req.ip;
  const f = failures.get(ip);
  if (f && f.count >= 10 && Date.now() - f.first < WINDOW_MS) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  const { username, password } = req.body || {};
  const user = username ? await User.findOne({ username: String(username).toLowerCase() }) : null;
  const ok = user && (await bcrypt.compare(String(password || ''), user.passwordHash));
  if (!ok) {
    const cur = f && Date.now() - f.first < WINDOW_MS ? f : { count: 0, first: Date.now() };
    cur.count += 1;
    failures.set(ip, cur);
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  failures.delete(ip);
  res.json({ token: signToken(user), user: { username: user.username, role: user.role } });
});

router.get('/me', requireAdmin, (req, res) => res.json({ user: req.user }));

export default router;
