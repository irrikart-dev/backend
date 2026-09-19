import { prisma } from '../../config/db.js';

export default {
  listForUser(userId) {
    return prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  },

  countForUser(userId) {
    return prisma.address.count({ where: { userId } });
  },

  // scoped by userId so an id from another user's address 404s instead of leaking
  findForUser(id, userId) {
    return prisma.address.findFirst({ where: { id, userId } });
  },

  create(userId, data) {
    return prisma.address.create({ data: { ...data, userId } });
  },

  update(id, data) {
    return prisma.address.update({ where: { id }, data });
  },

  delete(id) {
    return prisma.address.delete({ where: { id } });
  },

  async setDefault(id, userId) {
    await prisma.$transaction([
      prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
      prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
  },
};
