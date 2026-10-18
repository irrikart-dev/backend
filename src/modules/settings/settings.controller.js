import * as service from './settings.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// ---- admin (mounted under admin.routes.js) ----

export const getShippingRules = asyncHandler(async (req, res) => {
  const data = await service.getShippingRules();
  res.json({ success: true, data });
});

export const updateShippingRules = asyncHandler(async (req, res) => {
  const data = await service.updateShippingRules(req.validated.body);
  res.json({ success: true, data });
});
