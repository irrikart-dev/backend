import { Router } from 'express';
import { prisma } from '../../config/db.js';

const router = Router();

// real DB round-trip so the uptime monitor reflects whether the API can serve
// traffic, not just that the function booted
router.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up' });
  } catch {
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

export default router;
