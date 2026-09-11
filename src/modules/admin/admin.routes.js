import { Router } from 'express';
import multer from 'multer';
import * as controller from './admin.controller.js';
import { authenticate, loadUser, authorize } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import {
  createProductSchema,
  updateProductSchema,
  pricingSchema,
  stockSchema,
  createCategorySchema,
  updateCategorySchema,
} from './admin.validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const router = Router();

router.use(authenticate, loadUser, authorize('ADMIN'));

/**
 * @openapi
 * /admin/uploads/image:
 *   post:
 *     tags: [Admin]
 *     summary: Upload an image to object storage
 *     description: >
 *       Accepts a single image file (multipart field "file", max 5MB) and stores it
 *       in Supabase Storage. Returns the public URL to save on a product (imageUrl)
 *       or any other record.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Image uploaded }
 *       400: { description: Missing or non-image file }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       403: { description: Not an admin }
 */
router.post('/uploads/image', upload.single('file'), controller.uploadImage);

router.get('/products', controller.listProducts);
router.get('/products/:id', controller.getProduct);
router.post('/products', validate(createProductSchema), controller.createProduct);
router.patch('/products/:id', validate(updateProductSchema), controller.updateProduct);
router.patch('/products/:id/pricing', validate(pricingSchema), controller.updateProductPricing);
router.patch('/products/:id/stock', validate(stockSchema), controller.updateProductStock);
router.delete('/products/:id', controller.deleteProduct);

router.get('/categories', controller.listCategories);
router.post('/categories', validate(createCategorySchema), controller.createCategory);
router.patch('/categories/:id', validate(updateCategorySchema), controller.updateCategory);
router.delete('/categories/:id', controller.deleteCategory);

export default router;
