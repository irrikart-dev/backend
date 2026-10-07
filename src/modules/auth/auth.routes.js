import { Router } from 'express';
import * as controller from './auth.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { updateProfileSchema } from './auth.validation.js';

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

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: The caller's own profile
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User }
 *   patch:
 *     tags: [Auth]
 *     summary: Update the caller's display name
 *     description: Phone and email come from Firebase and can't be changed here.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Updated user }
 *       400: { description: Invalid body }
 */
router.get('/me', authenticate, loadUser, controller.getMe);
router.patch('/me', authenticate, loadUser, validate(updateProfileSchema), controller.updateMe);

/**
 * @openapi
 * /auth/account:
 *   delete:
 *     tags: [Auth]
 *     summary: Permanently delete the caller's account
 *     description: >
 *       Erases personal data (profile, saved addresses, cart, wishlist, reviews,
 *       RFQs, notifications) and deletes the Firebase user. Placed orders are
 *       retained without identity for GST record-keeping. Customer accounts only.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Account deleted }
 *       403: { description: Admin/vendor accounts must be deleted by support }
 */
router.delete('/account', authenticate, controller.deleteAccount);

export default router;
