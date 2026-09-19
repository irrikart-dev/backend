import * as service from './vendors.service.js';
import * as catalogService from '../catalog/catalog.service.js';
import * as ordersService from '../orders/orders.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// ---- admin: vendor management (mounted under admin.routes.js) ----

export const listVendors = asyncHandler(async (req, res) => {
  const data = await service.listVendors();
  res.json({ success: true, data });
});

export const getVendor = asyncHandler(async (req, res) => {
  const data = await service.getVendor(req.params.id);
  res.json({ success: true, data });
});

export const createVendor = asyncHandler(async (req, res) => {
  const data = await service.createVendor(req.validated.body);
  res.status(201).json({ success: true, data });
});

export const updateVendor = asyncHandler(async (req, res) => {
  const data = await service.updateVendor(req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const refreshRouteStatus = asyncHandler(async (req, res) => {
  const data = await service.refreshRouteStatus(req.params.id);
  res.json({ success: true, data });
});

// ---- vendor self-service (mounted under vendors.routes.js, /api/v1/vendor) ----

export const getMe = asyncHandler(async (req, res) => {
  const data = await service.getVendor(req.vendor.id);
  res.json({ success: true, data });
});

export const listMyProducts = asyncHandler(async (req, res) => {
  const data = await catalogService.listProducts({ vendorId: req.vendor.id });
  res.json({ success: true, data });
});

export const getMyProduct = asyncHandler(async (req, res) => {
  const data = await catalogService.getProduct(req.params.id, { vendorId: req.vendor.id });
  res.json({ success: true, data });
});

export const createMyProduct = asyncHandler(async (req, res) => {
  const data = await catalogService.createProduct({ ...req.validated.body, vendorId: req.vendor.id });
  res.status(201).json({ success: true, data });
});

export const updateMyProduct = asyncHandler(async (req, res) => {
  const data = await catalogService.updateProduct(req.params.id, req.validated.body, { vendorId: req.vendor.id });
  res.json({ success: true, data });
});

export const deleteMyProduct = asyncHandler(async (req, res) => {
  await catalogService.deleteProduct(req.params.id, { vendorId: req.vendor.id });
  res.status(204).send();
});

export const listMyOrders = asyncHandler(async (req, res) => {
  const data = await ordersService.listOrdersForVendor(req.vendor.id);
  res.json({ success: true, data });
});

export const getMyOrder = asyncHandler(async (req, res) => {
  const data = await ordersService.getOrderForVendor(req.vendor.id, req.params.id);
  res.json({ success: true, data });
});

export const listMyPayouts = asyncHandler(async (req, res) => {
  const data = await service.listPayouts(req.vendor.id);
  res.json({ success: true, data });
});
