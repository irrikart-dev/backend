import * as service from './discounts.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// ---- admin: coupon management (mounted under admin.routes.js) ----

export const listCoupons = asyncHandler(async (req, res) => {
  const data = await service.listCoupons();
  res.json({ success: true, data });
});

export const createCoupon = asyncHandler(async (req, res) => {
  const data = await service.createCoupon(req.validated.body);
  res.status(201).json({ success: true, data });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const data = await service.updateCoupon(req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  await service.deleteCoupon(req.params.id);
  res.status(204).send();
});

// ---- customer ----

export const listOffers = asyncHandler(async (req, res) => {
  const data = await service.listOffers(req.user.id);
  res.json({ success: true, data });
});
