import * as service from './admin.service.js';
import * as catalogService from '../catalog/catalog.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { BadRequestError } from '../../common/errors/AppError.js';

export const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new BadRequestError('No file uploaded (field name: "file")');

  const { url } = await service.uploadImage({
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
  });

  res.status(201).json({ success: true, data: { url } });
});

// ---- products ----

export const listProducts = asyncHandler(async (req, res) => {
  const data = await catalogService.listProducts({
    search: req.query.search,
    categoryId: req.query.category,
  });
  res.json({ success: true, data });
});

export const getProduct = asyncHandler(async (req, res) => {
  const data = await catalogService.getProduct(req.params.id);
  res.json({ success: true, data });
});

export const createProduct = asyncHandler(async (req, res) => {
  const data = await catalogService.createProduct(req.validated.body);
  res.status(201).json({ success: true, data });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const data = await catalogService.updateProduct(req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const updateProductPricing = asyncHandler(async (req, res) => {
  const data = await catalogService.updateProductPricing(req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const updateProductStock = asyncHandler(async (req, res) => {
  const data = await catalogService.updateProductStock(req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  await catalogService.deleteProduct(req.params.id);
  res.status(204).send();
});

// ---- categories ----

export const listCategories = asyncHandler(async (req, res) => {
  const data = await catalogService.listCategories();
  res.json({ success: true, data });
});

export const createCategory = asyncHandler(async (req, res) => {
  const data = await catalogService.createCategory(req.validated.body);
  res.status(201).json({ success: true, data });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const data = await catalogService.updateCategory(req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  await catalogService.deleteCategory(req.params.id);
  res.status(204).send();
});
