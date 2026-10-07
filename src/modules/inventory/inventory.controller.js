import * as service from './inventory.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// mounted under admin.routes.js (/admin/inventory), same split as vendors
export const history = asyncHandler(async (req, res) => {
  const data = await service.history(req.params.variantId);
  res.json({ success: true, data });
});

export const adjust = asyncHandler(async (req, res) => {
  const variant = await service.adjustStock(req.params.variantId, req.validated.body, req.user.id);
  res.json({ success: true, data: { id: variant.id, stockQty: variant.stock, available: variant.stock - variant.reserved } });
});
