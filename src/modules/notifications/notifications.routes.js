import { Router } from 'express';
import * as controller from './notifications.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { deviceSchema, listNotificationsQuerySchema, removeDeviceSchema } from './notifications.validation.js';

const router = Router();

router.use(authenticate, loadUser);

/**
 * @openapi
 * /notifications/devices:
 *   post:
 *     tags: [Notifications]
 *     summary: Register this device's FCM token for push (call after sign-in and on token refresh)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Registered — a token moves to whoever signed in last }
 *   delete:
 *     tags: [Notifications]
 *     summary: Stop pushing to this device (call on sign-out) — body { fcmToken }
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Removed }
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Notification centre — newest first, with the unread count
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ items, unread, page, limit, total }" }
 * /notifications/read-all:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark every notification read
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Done }
 * /notifications/{id}/read:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark one notification read
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Done }
 *       404: { description: Not the caller's notification }
 */
router.post('/devices', validate(deviceSchema), controller.registerDevice);
router.delete('/devices', validate(removeDeviceSchema), controller.removeDevice);
router.get('/', validate(listNotificationsQuerySchema), controller.listMine);
// before /:id/read, or "read-all" would match as an id
router.post('/read-all', controller.markAllRead);
router.post('/:id/read', controller.markRead);

export default router;
