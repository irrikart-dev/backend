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
