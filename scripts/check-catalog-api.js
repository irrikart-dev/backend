/**
 * Self-check for the public catalogue API (docs/app-catalog-api-contract.md).
 * Run against a running server:  node scripts/check-catalog-api.js
 * Temporarily hides one product to prove hidden products 404, then restores it.
 */
import assert from 'node:assert/strict';
import { prisma } from '../src/config/db.js';

const BASE = process.env.CHECK_BASE_URL ?? 'http://localhost:8000/api/v1';

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json() };
};

const PUBLIC_KEYS = [
  'id', 'sku', 'slug', 'name', 'category', 'categoryName', 'imageUrl', 'tagline',
  'description', 'features', 'specs', 'unit', 'price', 'inStock', 'stockQty',
  'rating', 'reviewCount', 'updatedAt',
];

async function main() {
  const categories = await get('/catalog/categories');
  assert.equal(categories.status, 200);
  assert.ok(categories.body.data.length > 0, 'expected at least one category');
  assert.ok(categories.body.data[0].slug, 'category must expose slug');

  const list = await get('/catalog/products?limit=1');
  assert.equal(list.status, 200);
  const { items, page, limit, total } = list.body.data;
  assert.equal(items.length, 1);
  assert.equal(page, 1);
  assert.equal(limit, 1);
  assert.ok(total >= 1);

  const product = items[0];
  assert.deepEqual(Object.keys(product).sort(), [...PUBLIC_KEYS].sort(), 'public DTO drifted');

  // every image URL must be absolute, including legacy rows stored as /public paths
  const absolute = (u) => u === null || /^https?:\/\//.test(u);
  const all = await get('/catalog/products?limit=100');
  for (const p of all.body.data.items) {
    assert.ok(absolute(p.imageUrl), `relative product imageUrl leaked: ${p.imageUrl}`);
  }
  for (const c of categories.body.data) {
    assert.ok(absolute(c.imageUrl), `relative category imageUrl leaked: ${c.imageUrl}`);
  }

  assert.equal((await get(`/catalog/products/${product.slug}`)).status, 200);
  assert.equal((await get(`/catalog/products/${product.id}`)).status, 200);
  assert.equal((await get('/catalog/products/no-such-product')).status, 404);
  assert.equal((await get('/catalog/products?limit=500')).status, 400);

  // a hidden product must be indistinguishable from a missing one
  await prisma.product.update({ where: { id: product.id }, data: { active: false } });
  try {
    assert.equal((await get(`/catalog/products/${product.slug}`)).status, 404, 'hidden product leaked');
    const afterHide = await get('/catalog/products?limit=100');
    assert.ok(
      !afterHide.body.data.items.some((p) => p.id === product.id),
      'hidden product still listed',
    );
  } finally {
    await prisma.product.update({ where: { id: product.id }, data: { active: true } });
  }

  console.log('catalog API contract: OK');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
