import { Router } from 'express';

import { completeSignup, requestSignupOtp, verifySignupOtp } from '../services/signup-service.js';
import { asyncRoute } from '../utils/async-route.js';

/**
 * Public email sign-up flow: request a code, verify it, set a password.
 *
 * The account is only created in the last step (`/signup/complete`), by
 * which point the email has been proven reachable — nothing is created in
 * Firebase for an address nobody confirmed.
 */
export const authRouter = Router();

authRouter.post(
  '/signup/request-otp',
  asyncRoute(async (req, res) => {
    res.json({ data: await requestSignupOtp(req.body?.email) });
  }),
);

authRouter.post(
  '/signup/verify-otp',
  asyncRoute(async (req, res) => {
    res.json({ data: await verifySignupOtp(req.body?.email, req.body?.otp) });
  }),
);

authRouter.post(
  '/signup/complete',
  asyncRoute(async (req, res) => {
    res.json({ data: await completeSignup(req.body?.signupToken, req.body?.password) });
  }),
);
