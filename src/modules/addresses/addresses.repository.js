import { prisma } from '../../config/db.js';

// archived rows belong to past orders only — every user-facing read skips them
const live = { archivedAt: null };

export default {
  listForUser(userId) {
    return prisma.address.findMany({
      where: { userId, ...live },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  },

  countForUser(userId, client = prisma) {
    return client.address.count({ where: { userId, ...live } });
  },

  // scoped by userId so an id from another user's address 404s instead of leaking
  findForUser(id, userId) {
    return prisma.address.findFirst({ where: { id, userId, ...live } });
  },

  isUsedByOrder(id, client = prisma) {
    return client.order.count({ where: { addressId: id } }).then((n) => n > 0);
  },

  create(data, client = prisma) {
    return client.address.create({ data });
  },

  update(id, data, client = prisma) {
    return client.address.update({ where: { id }, data });
  },

  archive(id, client = prisma) {
    return client.address.update({ where: { id }, data: { archivedAt: new Date(), isDefault: false } });
  },

  delete(id, client = prisma) {
    return client.address.delete({ where: { id } });
  },

  clearDefault(userId, client = prisma) {
    return client.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  },

  // after the default goes away, the newest remaining address takes over
  async promoteNewest(userId, client = prisma) {
    const newest = await client.address.findFirst({ where: { userId, ...live }, orderBy: { createdAt: 'desc' } });
    if (newest) await client.address.update({ where: { id: newest.id }, data: { isDefault: true } });
  },

  transaction(fn) {
    return prisma.$transaction(fn);
  },
};
