import * as service from './payments.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// razorpay calls this directly — no bearer token, payload shape checked defensively
// inside the service instead of the usual zod validate() middleware
export const handleWebhook = asyncHandler(async (req, res) => {
  await service.handleWebhookEvent(req.rawBody, req.headers['x-razorpay-signature'], req.body);
  res.json({ success: true });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const data = await service.verifyPayment({
    ...req.validated.body,
    userId: req.user.id,
  });
  res.json({ success: true, data });
});
