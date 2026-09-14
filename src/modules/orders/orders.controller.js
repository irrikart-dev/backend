import * as service from './orders.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const checkout = asyncHandler(async (req, res) => {
  const data = await service.checkout(req.user.id, req.validated.body);
  res.status(201).json({ success: true, data });
});
