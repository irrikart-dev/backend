import { randomUUID } from 'node:crypto';
import { storage } from '../../storage/index.js';
import repository from './admin.repository.js';
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
