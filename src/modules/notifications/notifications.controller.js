import * as service from './notifications.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// ---- customer ----

export const registerDevice = asyncHandler(async (req, res) => {
  await service.registerDevice(req.user.id, req.validated.body);
  res.status(204).send();
});

export const removeDevice = asyncHandler(async (req, res) => {
  await service.removeDevice(req.user.id, req.validated.body);
  res.status(204).send();
});

export const listMine = asyncHandler(async (req, res) => {
  const data = await service.listMine(req.user.id, req.validated.query);
  res.json({ success: true, data });
});

export const markRead = asyncHandler(async (req, res) => {
  await service.markRead(req.user.id, req.params.id);
  res.status(204).send();
});

export const markAllRead = asyncHandler(async (req, res) => {
  await service.markAllRead(req.user.id);
  res.status(204).send();
});

// ---- admin campaigns (mounted under admin.routes.js) ----

export const listCampaigns = asyncHandler(async (req, res) => {
  const data = await service.listCampaigns();
  res.json({ success: true, data });
});

export const sendCampaign = asyncHandler(async (req, res) => {
  const data = await service.sendCampaign(req.validated.body, req.user.id);
  res.status(201).json({ success: true, data });
});
