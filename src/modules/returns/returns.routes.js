import { Router } from 'express';
import * as controller from './returns.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { imageUpload } from '../../common/middlewares/upload.js';
import { createReturnSchema } from './returns.validation.js';

const router = Router();

router.use(authenticate, loadUser);

/**
 * @openapi
 * /returns/photos:
 *   post:
 *     tags: [Returns]
 *     summary: Upload one photo for a return request (multipart field "file", max 5MB)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: "{ url } — pass it in photoUrls" }
 * /returns:
 *   get:
 *     tags: [Returns]
 *     summary: The caller's return requests, newest first
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Return requests }
 *   post:
 *     tags: [Returns]
 *     summary: Ask to return or replace items from a delivered order
 *     description: >
 *       Within RETURN_WINDOW_DAYS of delivery, one open request per order. `items`
 *       defaults to everything still returnable. Staff approve, then complete it once
 *       the goods are back — that restocks them. Refunds are settled outside the app.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Return request }
 *       400: { description: Item not on the order, or more units than can be returned }
 *       404: { description: Order not found }
 *       409: { description: Not delivered, window closed, or a return already open }
 */
router.post('/photos', imageUpload, controller.uploadPhoto);
router.get('/', controller.listMine);
router.post('/', validate(createReturnSchema), controller.create);

export default router;
