import * as service from './shipping.service.js';
import env from '../../config/env.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { UnauthorizedError } from '../../common/errors/AppError.js';

export const handleWebhook = asyncHandler(async (req, res) => {
  if (env.SHIPROCKET_WEBHOOK_TOKEN) {
    const token = req.header('x-api-key');
    if (token !== env.SHIPROCKET_WEBHOOK_TOKEN) throw new UnauthorizedError('Invalid webhook token');
  }
  await service.recordWebhookEvent(req.body);
  res.json({ success: true });
});

export const checkServiceability = asyncHandler(async (req, res) => {
  const data = await service.checkServiceability(req.validated.query);
  res.json({ success: true, data });
});

// ---- admin (mounted under admin.routes.js) ----

export const courierRatesForAdmin = asyncHandler(async (req, res) => {
  const data = await service.courierRatesForAdmin(req.validated.query);
  res.json({ success: true, data });
});

export const listIssuesForAdmin = asyncHandler(async (req, res) => {
  const data = await service.listIssuesForAdmin();
  res.json({ success: true, data });
});

export const bookForAdmin = asyncHandler(async (req, res) => {
  const data = await service.bookShipmentForAdmin(req.params.id);
  res.json({ success: true, data });
});
