import * as service from './catalog.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const listCategories = asyncHandler(async (req, res) => {
  const data = await service.listCategories();
  res.json({ success: true, data });
});

export const listBrands = asyncHandler(async (req, res) => {
  const data = await service.listBrands();
  res.json({ success: true, data });
});

export const listProducts = asyncHandler(async (req, res) => {
  const { category, brand, vendor, ...rest } = req.validated.query;
  const data = await service.listPublicProducts({
    ...rest,
    categoryId: category,
    brandId: brand,
    vendorId: vendor,
  });
  res.json({ success: true, data });
});

export const getProduct = asyncHandler(async (req, res) => {
  const data = await service.getPublicProduct(req.params.idOrSlug);
  res.json({ success: true, data });
});

// ---- caller's own wishlist / recently viewed ----

export const listWishlist = asyncHandler(async (req, res) => {
  const data = await service.listWishlist(req.user.id);
  res.json({ success: true, data });
});

export const addToWishlist = asyncHandler(async (req, res) => {
  const data = await service.addToWishlist(req.user.id, req.params.productId);
  res.json({ success: true, data });
});

export const removeFromWishlist = asyncHandler(async (req, res) => {
  const data = await service.removeFromWishlist(req.user.id, req.params.productId);
  res.json({ success: true, data });
});

export const listRecentlyViewed = asyncHandler(async (req, res) => {
  const data = await service.listRecentlyViewed(req.user.id);
  res.json({ success: true, data });
});

export const recordView = asyncHandler(async (req, res) => {
  await service.recordView(req.user.id, req.params.productId);
  res.status(204).send();
});
