import * as service from './addresses.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const list = asyncHandler(async (req, res) => {
  const data = await service.listForUser(req.user.id);
  res.json({ success: true, data });
});

export const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.user.id, req.validated.body);
  res.status(201).json({ success: true, data });
});

export const update = asyncHandler(async (req, res) => {
  const data = await service.update(req.user.id, req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const remove = asyncHandler(async (req, res) => {
  await service.remove(req.user.id, req.params.id);
  res.status(204).send();
});

export const setDefault = asyncHandler(async (req, res) => {
  await service.setDefault(req.user.id, req.params.id);
  res.status(204).send();
});
