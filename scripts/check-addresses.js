/**
 * Offline self-check for address rules (archive-on-change, single default).
 * In-memory repository stub, no DB:  node scripts/check-addresses.js
 */
import assert from 'node:assert/strict';
import repository from '../src/modules/addresses/addresses.repository.js';
import * as service from '../src/modules/addresses/addresses.service.js';

let rows = [];
let seq = 0;
const usedByOrder = new Set();
const live = (userId) => rows.filter((r) => r.userId === userId && !r.archivedAt);
Object.assign(repository, {
  transaction: (fn) => fn(null),
  countForUser: async (userId) => live(userId).length,
  // copies, like Prisma — later writes must not mutate a row the service already read
  findForUser: async (id, userId) => {
    const row = live(userId).find((r) => r.id === id);
    return row ? { ...row } : null;
  },
  listForUser: async (userId) => live(userId),
  isUsedByOrder: async (id) => usedByOrder.has(id),
  create: async (data) => {
    const row = { id: `a${++seq}`, createdAt: seq, archivedAt: null, line2: null, ...data };
    rows.push(row);
    return row;
  },
  update: async (id, data) => Object.assign(rows.find((r) => r.id === id), data),
  archive: async (id) => Object.assign(rows.find((r) => r.id === id), { archivedAt: new Date(), isDefault: false }),
  delete: async (id) => void (rows = rows.filter((r) => r.id !== id)),
  clearDefault: async (userId) => rows.filter((r) => r.userId === userId).forEach((r) => (r.isDefault = false)),
  promoteNewest: async (userId) => {
    const newest = live(userId).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (newest) newest.isDefault = true;
  },
});

const addr = { name: 'Ravi', phone: '9876543210', line1: 'Plot 4', city: 'Nashik', state: 'MH', pincode: '422001' };
const defaults = () => live('u1').filter((r) => r.isDefault).map((r) => r.id);

const a = await service.create('u1', addr);
assert.equal(a.isDefault, true, 'first address is default');
const b = await service.create('u1', { ...addr, line1: 'Farm road', isDefault: true });
assert.deepEqual(defaults(), [b.id], 'new default clears the old one');

await service.update('u1', b.id, { isDefault: false });
assert.deepEqual(defaults(), [b.id], 'cannot unset the only default');

// edit an address an order shipped to: old row frozen, new row replaces it
usedByOrder.add(b.id);
assert.equal((await service.update('u1', b.id, {})).id, b.id, 'no-op edit keeps the same row');
const b2 = await service.update('u1', b.id, { city: 'Pune' });
assert.notEqual(b2.id, b.id);
assert.equal(rows.find((r) => r.id === b.id).city, 'Nashik', 'order keeps original address');
assert.equal(b2.city, 'Pune');
assert.deepEqual(defaults(), [b2.id], 'replacement keeps default');

// deleting the default promotes the newest remaining; used rows are archived not deleted
usedByOrder.add(b2.id);
await service.remove('u1', b2.id);
assert.ok(rows.find((r) => r.id === b2.id).archivedAt, 'used address archived');
assert.deepEqual(defaults(), [a.id], 'default moved to remaining address');
await service.remove('u1', a.id);
assert.equal(rows.some((r) => r.id === a.id), false, 'unused address hard-deleted');
await assert.rejects(service.update('u1', b.id, { city: 'X' }), /not found/i, 'archived address is gone for the user');

console.log('address checks passed');
