import { Router } from 'express';
import * as controller from './auth.controller.js';
import { authenticate } from '../../common/middlewares/auth.js';

const router = Router();

/**
 * @openapi
 * /auth/firebase/sync:
 *   post:
 *     tags: [Auth]
 *     summary: Sync the verified Firebase user into our own User table
 *     description: >
 *       Called once right after the client completes Firebase Auth (phone OTP,
 *       or email/password for admin). Client sends the Firebase ID token as a
 *       Bearer header; this endpoint verifies it and creates the User row on
 *       first sign-in, or returns the existing one.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User synced }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 */
router.post('/firebase/sync', authenticate, controller.syncFirebaseUser);

/**
 * @openapi
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke every session for this Firebase user, across all devices
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All sessions revoked }
 */
router.post('/logout-all', authenticate, controller.logoutAllDevices);

export default router;
