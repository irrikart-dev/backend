import * as service from './wallet.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const getMine = asyncHandler(async (req, res) => {
  const data = await service.getMine(req.user.id);
  res.json({ success: true, data });
});

// ---- admin (mounted under admin.routes.js) ----

export const listRefundsForAdmin = asyncHandler(async (req, res) => {
  const data = await service.listRefundsForAdmin(req.validated.query);
  res.json({ success: true, data });
});
