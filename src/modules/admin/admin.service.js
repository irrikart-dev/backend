import { randomUUID } from 'node:crypto';
import { storage } from '../../storage/index.js';
import repository from './admin.repository.js';
import { firebaseAuth } from '../../config/firebase.js';
import logger from '../../common/utils/logger.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/AppError.js';

/** Uploads a file buffer to storage and returns its public URL. */
export async function uploadImage({ buffer, mimeType, folder = 'products' }) {
  const ext = mimeType.split('/')[1] || 'bin';
  const key = `${folder}/${randomUUID()}.${ext}`;

  const { url } = await storage.upload(key, buffer, { contentType: mimeType });
  return { url, path: key };
}

/** Deletes a file from storage given its public URL. Best-effort: an orphaned blob is a cleanup job, not a reason to fail the product/category write. */
export async function deleteImage(url) {
  await storage.delete(url);
}

// ---- staff (sub-admins) — managed by full ADMINs only ----


export function listStaff() {
  return repository.listStaff();
}

// same constraint as vendors/promote-admin.js: the person signs in once first, so
// their User row exists to promote
export async function addStaff({ email, permissions }) {
  const user = await repository.findUserByEmail(email);
  if (!user) throw new BadRequestError('No account for that email yet — they need to sign in to the dashboard once first');
  if (user.role !== 'CUSTOMER') throw new ConflictError(`That account is already a ${user.role.toLowerCase().replace('_', '-')}`);
  return repository.updateUser(user.id, { role: 'SUB_ADMIN', permissions });
}

export async function updateStaff(id, { permissions }) {
  const user = await repository.findUserById(id);
  if (!user || user.role !== 'SUB_ADMIN') throw new NotFoundError('Sub-admin not found');
  return repository.updateUser(id, { permissions });
}

// demotes back to a plain customer account; full ADMINs are never removed from here
export async function removeStaff(id) {
  const user = await repository.findUserById(id);
  if (!user || user.role !== 'SUB_ADMIN') throw new NotFoundError('Sub-admin not found');
  await repository.updateUser(id, { role: 'CUSTOMER', permissions: [] });
}

// ---- customers ----

export async function listCustomers({ search, status, page, limit }) {
  const where = {
    role: 'CUSTOMER',
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: ['name', 'phone', 'email'].map((field) => ({
            [field]: { contains: search, mode: 'insensitive' },
          })),
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    repository.listCustomers(where, { skip: (page - 1) * limit, take: limit }),
    repository.countCustomers(where),
  ]);
  const spent = new Map(
    (await repository.sumPaidOrdersByUser(rows.map((r) => r.id))).map((g) => [g.userId, Number(g._sum.totalAmount ?? 0)])
  );
  return {
    items: rows.map(({ _count, ...u }) => ({ ...u, orderCount: _count.orders, totalSpent: spent.get(u.id) ?? 0 })),
    page,
    limit,
    total,
  };
}

export async function getCustomer(id) {
  const row = await repository.findCustomer(id);
  if (!row) throw new NotFoundError('Customer not found');
  const [spent] = await repository.sumPaidOrdersByUser([id]);
  const { _count, orders, ...user } = row;
  return {
    ...user,
    orderCount: _count.orders,
    totalSpent: Number(spent?._sum.totalAmount ?? 0),
    orders: orders.map((o) => ({ ...o, totalAmount: Number(o.totalAmount), vendor: o.vendor.storeName })),
  };
}

// a blocked customer is signed out everywhere (Firebase sessions revoked) and turned
// away by loadUser / firebase sync if they sign in again; staff and vendors have their
// own off-switches (Staff page, vendor suspend)
export async function setCustomerStatus(id, status) {
  if (!(await repository.findCustomer(id))) throw new NotFoundError('Customer not found');
  const user = await repository.setUserStatus(id, status);
  if (status === 'BLOCKED') {
    try {
      await firebaseAuth.revokeRefreshTokens(user.firebaseUid);
    } catch (err) {
      // loadUser still rejects them on every request — this only shortens existing sessions
      logger.warn({ err, userId: id }, 'could not revoke Firebase sessions for blocked customer');
    }
  }
  return getCustomer(id);
}
