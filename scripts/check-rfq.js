/**
 * Offline self-check for the RFQ module's rules. Stubs the repository, no DB:
 *   node scripts/check-rfq.js
 */
import assert from 'node:assert/strict';
import repository from '../src/modules/rfq/rfq.repository.js';
import { createRfqSchema, updateRfqSchema } from '../src/modules/rfq/rfq.validation.js';
import { createRfq, listForAdmin, updateForAdmin } from '../src/modules/rfq/rfq.service.js';

const body = (b) => createRfqSchema.safeParse({ body: b }).success;
assert.equal(body({ quantity: 500, requirements: '16mm drip line' }), true);
assert.equal(body({ quantity: 500, productId: 'p1' }), true);
assert.equal(body({ quantity: 500 }), false, 'needs product or requirements');
assert.equal(body({ quantity: 500, requirements: '   ' }), false, 'blank requirements is not a description');
assert.equal(body({ quantity: 0, requirements: 'x' }), false);
assert.equal(updateRfqSchema.safeParse({ body: { status: 'QUOTED' } }).success, false);

let created;
repository.create = async (data) => {
  created = data;
  return { id: 'r1', ...data, status: 'NEW', adminNote: null, createdAt: new Date(), user: {}, product: null };
};
const dto = await createRfq('u1', { quantity: 200, requirements: 'Need pipes', targetPrice: 40 });
assert.deepEqual(created, { userId: 'u1', productId: null, quantity: 200, requirements: 'Need pipes', targetPrice: 40 });
assert.equal(dto.status, 'NEW');
assert.equal('adminNote' in dto, false, 'customer never sees the internal note');

let where;
repository.listForAdmin = async (w) => ((where = w), []);
repository.countForAdmin = async () => 0;
await listForAdmin({ status: 'NEW', search: 'drip', page: 2, limit: 25 });
assert.equal(where.status, 'NEW');
assert.equal(where.OR.length, 3, 'searches customer, product title and requirements');

let patch;
repository.findById = async () => ({ id: 'r1', user: {}, product: null });
repository.update = async (id, data) => ((patch = data), { id, ...data, user: {}, product: null });
await updateForAdmin('r1', { status: 'CONTACTED', adminNote: '' });
assert.deepEqual(patch, { status: 'CONTACTED', adminNote: null });
await updateForAdmin('r1', { adminNote: 'quoted 42/m' });
assert.deepEqual(patch, { adminNote: 'quoted 42/m' }, 'status untouched when omitted');

console.log('rfq checks passed');
process.exit(0);
