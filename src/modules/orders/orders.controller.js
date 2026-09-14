import * as service from './orders.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const checkout = asyncHandler(async (req, res) => {
  const data = await service.checkout(req.user.id, req.validated.body);
  res.status(201).json({ success: true, data });
});

export const getOrder = asyncHandler(async (req, res) => {
  const data = await service.getOrder(req.user.id, req.params.id);
  res.json({ success: true, data });
});

export const listOrders = asyncHandler(async (req, res) => {
  const data = await service.listOrders(req.user.id);
  res.json({ success: true, data });
});
