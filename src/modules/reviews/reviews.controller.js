import * as service from './reviews.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const submitReview = asyncHandler(async (req, res) => {
  await service.submitReview(req.user.id, req.validated.body);
  res.status(201).json({ success: true, data: null });
});

export const listForProduct = asyncHandler(async (req, res) => {
  const data = await service.listForProduct(req.params.productId);
  res.json({ success: true, data });
});
