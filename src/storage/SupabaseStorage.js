import { supabaseAdmin } from '../config/supabase.js';
import env from '../config/env.js';
import { AppError } from '../common/errors/AppError.js';
import logger from '../common/utils/logger.js';
import { Storage } from './Storage.js';

const BUCKET = env.SUPABASE_STORAGE_BUCKET;
const PUBLIC_URL_MARKER = `/storage/v1/object/public/${BUCKET}/`;

export class SupabaseStorage extends Storage {
  // created once per process; createBucket on an existing bucket just errors, which we swallow
  #ready = supabaseAdmin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  // callers may pass either a raw key or a public URL we previously issued
  #resolveKey(keyOrUrl) {
    const markerIndex = keyOrUrl.indexOf(PUBLIC_URL_MARKER);
    return markerIndex === -1 ? keyOrUrl : keyOrUrl.slice(markerIndex + PUBLIC_URL_MARKER.length);
  }

  async upload(key, data, options = {}) {
    await this.#ready;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(key, data, { contentType: options.contentType, upsert: false });

    if (error) throw new AppError(`Upload failed: ${error.message}`, 502);

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
    return { key, url: urlData.publicUrl };
  }

  async download(key) {
    await this.#ready;
    const path = this.#resolveKey(key);

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
    if (error) throw new AppError(`Download failed: ${error.message}`, 502);

    return Buffer.from(await data.arrayBuffer());
  }

  async delete(key) {
    if (!key) return;
    await this.#ready;
    const path = this.#resolveKey(key);

    const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
    if (error) logger.warn({ path, error }, 'failed to delete image from storage');
  }

  async exists(key) {
    await this.#ready;
    const path = this.#resolveKey(key);
    const lastSlash = path.lastIndexOf('/');
    const folder = lastSlash === -1 ? '' : path.slice(0, lastSlash);
    const filename = lastSlash === -1 ? path : path.slice(lastSlash + 1);

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(folder, { search: filename });
    if (error) throw new AppError(`exists() failed: ${error.message}`, 502);

    return data.some((file) => file.name === filename);
  }
}
