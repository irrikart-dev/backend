import { Router } from 'express';
import * as controller from './addresses.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { createAddressSchema, updateAddressSchema } from './addresses.validation.js';

const router = Router();

router.use(authenticate, loadUser);

/**
 * @openapi
 * /addresses:
 *   get:
 *     tags: [Addresses]
 *     summary: List the caller's saved addresses
 *     description: Default address first, then newest first.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Addresses }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 */
router.get('/', controller.list);

/**
 * @openapi
 * /addresses:
 *   post:
 *     tags: [Addresses]
 *     summary: Save a new address
 *     description: >
 *       The caller's first address is always forced to isDefault:true regardless of what's
 *       passed — there is never a state with saved addresses but no default.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Address created }
 *       400: { description: Invalid body }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 */
router.post('/', validate(createAddressSchema), controller.create);

/**
 * @openapi
 * /addresses/{id}:
 *   patch:
 *     tags: [Addresses]
 *     summary: Update a saved address
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Updated address }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: Address not found }
 */
router.patch('/:id', validate(updateAddressSchema), controller.update);

/**
 * @openapi
 * /addresses/{id}:
 *   delete:
 *     tags: [Addresses]
 *     summary: Delete a saved address
 *     description: Blocked if any order already references it.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Deleted }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: Address not found }
 */
router.delete('/:id', controller.remove);

/**
 * @openapi
 * /addresses/{id}/default:
 *   post:
 *     tags: [Addresses]
 *     summary: Make this the caller's default address
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Now the default }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: Address not found }
 */
router.post('/:id/default', controller.setDefault);

export default router;
