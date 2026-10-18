import * as service from './returns.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { BadRequestError } from '../../common/errors/AppError.js';

// ---- customer ----

export const uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) throw new BadRequestError('No file uploaded (field name: "file")');
  const { url } = await service.uploadPhoto({ buffer: req.file.buffer, mimeType: req.file.mimetype });
  res.status(201).json({ success: true, data: { url } });
});

export const create = asyncHandler(async (req, res) => {
  const data = await service.requestReturn(req.user.id, req.validated.body);
  res.status(201).json({ success: true, data });
});

export const listMine = asyncHandler(async (req, res) => {
  const data = await service.listMine(req.user.id);
  res.json({ success: true, data });
});

// ---- admin (mounted under admin.routes.js) ----

export const listForAdmin = asyncHandler(async (req, res) => {
  const data = await service.listForAdmin(req.validated.query);
  res.json({ success: true, data });
});

export const getForAdmin = asyncHandler(async (req, res) => {
  const data = await service.getForAdmin(req.params.id);
  res.json({ success: true, data });
});

export const approve = asyncHandler(async (req, res) => {
  const data = await service.approve(req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const reject = asyncHandler(async (req, res) => {
  const data = await service.reject(req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const complete = asyncHandler(async (req, res) => {
  const data = await service.complete(req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const receiveRto = asyncHandler(async (req, res) => {
  const data = await service.receiveRto(req.params.id);
  res.json({ success: true, data });
});
