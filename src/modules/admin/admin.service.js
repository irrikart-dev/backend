import { randomUUID } from 'node:crypto';
import { storage } from '../../storage/index.js';

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
