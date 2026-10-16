import * as service from './rfq.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// ---- customer ----

export const create = asyncHandler(async (req, res) => {
  const data = await service.createRfq(req.user.id, req.validated.body);
  res.status(201).json({ success: true, data });
});

export const listMine = asyncHandler(async (req, res) => {
  const data = await service.listMine(req.user.id);
  res.json({ success: true, data });
});

// ---- admin inbox (mounted under admin.routes.js) ----

export const listForAdmin = asyncHandler(async (req, res) => {
  const data = await service.listForAdmin(req.validated.query);
  res.json({ success: true, data });
});

export const getForAdmin = asyncHandler(async (req, res) => {
  const data = await service.getForAdmin(req.params.id);
  res.json({ success: true, data });
});

export const updateForAdmin = asyncHandler(async (req, res) => {
  const data = await service.updateForAdmin(req.params.id, req.validated.body);
  res.json({ success: true, data });
});
