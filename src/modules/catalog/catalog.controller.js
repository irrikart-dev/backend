import * as service from './catalog.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const listCategories = asyncHandler(async (req, res) => {
  const data = await service.listCategories();
  res.json({ success: true, data });
});

export const listProducts = asyncHandler(async (req, res) => {
  const { category, search, page, limit } = req.validated.query;
  const data = await service.listPublicProducts({ categoryId: category, search, page, limit });
  res.json({ success: true, data });
});

export const getProduct = asyncHandler(async (req, res) => {
  const data = await service.getPublicProduct(req.params.idOrSlug);
  res.json({ success: true, data });
});
