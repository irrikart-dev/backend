import repository from './rfq.repository.js';
import * as catalogService from '../catalog/catalog.service.js';
import { NotFoundError } from '../../common/errors/AppError.js';

// An RFQ is a bulk-quote lead, not an order: nothing here touches cart, stock or
// payments. Staff follow up by email/phone outside the app and track it with status.

function toCustomerDto(r) {
  return {
    id: r.id,
    status: r.status,
    quantity: r.quantity,
    requirements: r.requirements,
    targetPrice: r.targetPrice == null ? null : Number(r.targetPrice),
    product: r.product ?? null,
    createdAt: r.createdAt,
  };
}

function toAdminDto(r) {
  return { ...toCustomerDto(r), adminNote: r.adminNote, customer: r.user };
}

export async function createRfq(userId, { productId, quantity, requirements, targetPrice }) {
  // same visibility rule as the catalogue — 404s hidden or unsellable products
  const product = productId ? await catalogService.getPublicProduct(productId) : null;
  const row = await repository.create({
    userId,
    productId: product?.id ?? null,
    quantity,
    requirements: requirements || null,
    targetPrice: targetPrice ?? null,
  });
  return toCustomerDto(row);
}

export async function listMine(userId) {
  const rows = await repository.listForUser(userId);
  return rows.map(toCustomerDto);
}

export async function listForAdmin({ status, search, page, limit }) {
  const contains = (field) => ({ [field]: { contains: search, mode: 'insensitive' } });
  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { user: { OR: ['name', 'phone', 'email'].map(contains) } },
            { product: contains('title') },
            contains('requirements'),
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    repository.listForAdmin(where, { skip: (page - 1) * limit, take: limit }),
    repository.countForAdmin(where),
  ]);
  return { items: rows.map(toAdminDto), page, limit, total };
}

export async function getForAdmin(id) {
  const row = await repository.findById(id);
  if (!row) throw new NotFoundError('Quote request not found');
  return toAdminDto(row);
}

export async function updateForAdmin(id, { status, adminNote }) {
  await getForAdmin(id);
  const row = await repository.update(id, {
    ...(status !== undefined ? { status } : {}),
    ...(adminNote !== undefined ? { adminNote: adminNote || null } : {}),
  });
  return toAdminDto(row);
}
