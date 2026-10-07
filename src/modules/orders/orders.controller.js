import * as service from './orders.service.js';
import { renderInvoice } from './orders.invoice.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const checkout = asyncHandler(async (req, res) => {
  const data = await service.checkout(req.user, req.validated.body);
  res.status(201).json({ success: true, data });
});

export const getOrder = asyncHandler(async (req, res) => {
  const data = await service.getOrder(req.user.id, req.params.id);
  res.json({ success: true, data });
});

export const listOrders = asyncHandler(async (req, res) => {
  const data = await service.listOrders(req.user.id);
  res.json({ success: true, data });
});

export const payOrder = asyncHandler(async (req, res) => {
  const data = await service.payOrder(req.user, req.params.id);
  res.json({ success: true, data });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const data = await service.cancelOrderByCustomer(req.user.id, req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const reorder = asyncHandler(async (req, res) => {
  const data = await service.reorder(req.user.id, req.params.id);
  res.json({ success: true, data });
});

async function sendInvoice(res, invoiceData) {
  const pdf = await renderInvoice(invoiceData);
  res
    .set('Content-Type', 'application/pdf')
    .set('Content-Disposition', `attachment; filename="invoice-${invoiceData.order.orderNumber}.pdf"`)
    .send(pdf);
}

export const getInvoice = asyncHandler(async (req, res) => {
  await sendInvoice(res, await service.getOrderForInvoice(req.params.id, { userId: req.user.id }));
});

// ---- admin console (mounted under admin.routes.js, /admin/orders) ----

export const listForAdmin = asyncHandler(async (req, res) => {
  const data = await service.listOrdersForAdmin(req.validated.query);
  res.json({ success: true, data });
});

export const getForAdmin = asyncHandler(async (req, res) => {
  const data = await service.getOrderForAdmin(req.params.id);
  res.json({ success: true, data });
});

export const updateStatusForAdmin = asyncHandler(async (req, res) => {
  const data = await service.advanceOrderForAdmin(req.params.id, req.validated.body.status);
  res.json({ success: true, data });
});

export const cancelForAdmin = asyncHandler(async (req, res) => {
  const data = await service.cancelOrderByAdmin(req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const getInvoiceForAdmin = asyncHandler(async (req, res) => {
  await sendInvoice(res, await service.getOrderForInvoice(req.params.id));
});

// ---- vendor self-service (mounted under vendors.routes.js, /vendor/orders) ----

export const acceptForVendor = asyncHandler(async (req, res) => {
  const data = await service.acceptOrder(req.vendor.id, req.params.id);
  res.json({ success: true, data });
});

export const rejectForVendor = asyncHandler(async (req, res) => {
  const data = await service.rejectOrder(req.vendor.id, req.params.id, req.validated.body);
  res.json({ success: true, data });
});

export const updateStatusForVendor = asyncHandler(async (req, res) => {
  const data = await service.advanceOrderForVendor(req.vendor.id, req.params.id, req.validated.body.status);
  res.json({ success: true, data });
});
