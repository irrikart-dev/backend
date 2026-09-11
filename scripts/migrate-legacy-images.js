/**
 * One-off: move the original catalogue's images (served locally from /public,
 * stored as relative DB paths like /products/img003.jpg) onto Supabase Storage,
 * same place every admin-uploaded image already lives. Once every row is
 * absolute, PUBLIC_BASE_URL can be dropped from env.
 *
 * Run:  node scripts/migrate-legacy-images.js
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/config/db.js';
import { uploadImage } from '../src/modules/admin/admin.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../public');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// same local file can back more than one row (products sharing a stock photo) —
// upload it once, reuse the resulting Supabase URL for every row that pointed at it
const uploaded = new Map();

async function migrate(localPath) {
  if (uploaded.has(localPath)) return uploaded.get(localPath);

  const ext = path.extname(localPath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) throw new Error(`Unknown image type: ${localPath}`);

  const buffer = await readFile(path.join(PUBLIC_DIR, localPath));
  const { url } = await uploadImage({ buffer, mimeType });
  uploaded.set(localPath, url);
  return url;
}

async function main() {
  const images = await prisma.productImage.findMany({ where: { url: { not: { startsWith: 'http' } } } });
  for (const img of images) {
    const url = await migrate(img.url);
    await prisma.productImage.update({ where: { id: img.id }, data: { url } });
    console.log(`product image ${img.id}: ${img.url} -> ${url}`);
  }

  const categories = await prisma.category.findMany({
    where: { imageUrl: { not: null }, NOT: { imageUrl: { startsWith: 'http' } } },
  });
  for (const cat of categories) {
    const url = await migrate(cat.imageUrl);
    await prisma.category.update({ where: { id: cat.id }, data: { imageUrl: url } });
    console.log(`category ${cat.id}: ${cat.imageUrl} -> ${url}`);
  }

  console.log(`done: ${images.length} product image(s), ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}, ${uploaded.size} unique file(s) uploaded`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
