import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../config/supabase.js';
import env from '../../config/env.js';
import { AppError } from '../../common/errors/AppError.js';
import logger from '../../common/utils/logger.js';

const BUCKET = env.SUPABASE_STORAGE_BUCKET;
const PUBLIC_URL_MARKER = `/storage/v1/object/public/${BUCKET}/`;

// created once per process; createBucket on an existing bucket just errors, which we swallow
let bucketReady = supabaseAdmin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

/** Uploads a file buffer to Supabase Storage and returns its public URL. */
export async function uploadImage({ buffer, mimeType, folder = 'products' }) {
  await bucketReady;

  const ext = mimeType.split('/')[1] || 'bin';
  const path = `${folder}/${randomUUID()}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (error) throw new AppError(`Upload failed: ${error.message}`, 502);

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Deletes a file from Supabase Storage given its public URL. Best-effort: a
 * URL we didn't issue (or a failed remove) is logged, not thrown — an orphaned
 * blob is a cleanup job, not a reason to fail the product/category write.
 */
export async function deleteImage(url) {
  if (!url) return;

  const markerIndex = url.indexOf(PUBLIC_URL_MARKER);
  if (markerIndex === -1) return;
  const path = url.slice(markerIndex + PUBLIC_URL_MARKER.length);

  await bucketReady;
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
  if (error) logger.warn({ path, error }, 'failed to delete image from storage');
}
