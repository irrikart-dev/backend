import * as service from './payments.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// razorpay calls this directly — no bearer token, payload shape checked defensively
// inside the service instead of the usual zod validate() middleware
export const handleWebhook = asyncHandler(async (req, res) => {
  await service.handleWebhookEvent(req.rawBody, req.headers['x-razorpay-signature'], req.body);
  res.json({ success: true });
});
