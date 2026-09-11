/**
 * Self-check: deleting or replacing a product/category image must remove the
 * old blob from Supabase Storage, not just the DB row (see admin.service.js
 * deleteImage, wired into catalog.service.js).
 * Run:  node scripts/check-image-cleanup.js
 */
import assert from 'node:assert/strict';
import { prisma } from '../src/config/db.js';
import { supabaseAdmin } from '../src/config/supabase.js';
import env from '../src/config/env.js';
import { uploadImage } from '../src/modules/admin/admin.service.js';
import * as catalogService from '../src/modules/catalog/catalog.service.js';

const BUCKET = env.SUPABASE_STORAGE_BUCKET;
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const pathOf = (url) => url.split(`/${BUCKET}/`)[1];
const existsInStorage = async (url) => {
  const path = pathOf(url);
  const dir = path.split('/').slice(0, -1).join('/');
  const file = path.split('/').pop();
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(dir, { search: file });
  return (data ?? []).some((f) => f.name === file);
};

async function main() {
  const category = await prisma.category.create({
    data: { name: `cleanup-check-${Date.now()}`, slug: `cleanup-check-${Date.now()}` },
  });

  // --- product image: delete removes the blob ---
  const { url: img1 } = await uploadImage({ buffer: png1x1, mimeType: 'image/png' });
  assert.ok(await existsInStorage(img1), 'setup: uploaded image should exist');

  const product = await catalogService.createProduct({
    name: `cleanup-check-${Date.now()}`,
    category: category.id,
    price: 10,
    imageUrl: img1,
  });
  await catalogService.deleteProduct(product.id);
  assert.ok(!(await existsInStorage(img1)), 'deleteProduct left its image blob behind');

  // --- product image: replacing on update removes the old blob ---
  const { url: img2 } = await uploadImage({ buffer: png1x1, mimeType: 'image/png' });
  const { url: img3 } = await uploadImage({ buffer: png1x1, mimeType: 'image/png' });
  const p2 = await catalogService.createProduct({
    name: `cleanup-check-${Date.now()}-2`,
    category: category.id,
    price: 10,
    imageUrl: img2,
  });
  await catalogService.updateProduct(p2.id, { imageUrl: img3 });
  assert.ok(!(await existsInStorage(img2)), 'updateProduct left the replaced image blob behind');
  assert.ok(await existsInStorage(img3), 'updateProduct should not touch the new image');
  await catalogService.deleteProduct(p2.id);
  assert.ok(!(await existsInStorage(img3)), 'cleanup: second image should be gone too');

  // --- category image: delete removes the blob ---
  const { url: img4 } = await uploadImage({ buffer: png1x1, mimeType: 'image/png' });
  const category2 = await prisma.category.update({
    where: { id: category.id },
    data: { imageUrl: img4 },
  });
  await catalogService.deleteCategory(category2.id);
  assert.ok(!(await existsInStorage(img4)), 'deleteCategory left its image blob behind');

  console.log('image cleanup: OK');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
