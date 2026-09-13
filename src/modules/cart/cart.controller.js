import * as service from './cart.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const getCart = asyncHandler(async (req, res) => {
  const data = await service.getCart(req.user.id);
  res.json({ success: true, data });
});

export const addItem = asyncHandler(async (req, res) => {
  const data = await service.addItem(req.user.id, req.validated.body);
  res.json({ success: true, data });
});

export const updateItemQuantity = asyncHandler(async (req, res) => {
  const data = await service.updateItemQuantity(
    req.user.id,
    req.params.itemId,
    req.validated.body.quantity
  );
  res.json({ success: true, data });
});

export const removeItem = asyncHandler(async (req, res) => {
  const data = await service.removeItem(req.user.id, req.params.itemId);
  res.json({ success: true, data });
});

export const clearCart = asyncHandler(async (req, res) => {
  const data = await service.clearCart(req.user.id);
  res.json({ success: true, data });
});
