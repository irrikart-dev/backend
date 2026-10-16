import { prisma } from '../../config/db.js';

const adminInclude = {
  user: { select: { name: true, phone: true, email: true } },
  product: { select: { id: true, title: true, slug: true } },
};

export default {
  create(data) {
    return prisma.rfqRequest.create({ data, include: adminInclude });
  },

  listForUser(userId) {
    return prisma.rfqRequest.findMany({
      where: { userId },
      include: { product: adminInclude.product },
      orderBy: { createdAt: 'desc' },
    });
  },

  listForAdmin(where, { skip, take }) {
    return prisma.rfqRequest.findMany({ where, include: adminInclude, orderBy: { createdAt: 'desc' }, skip, take });
  },

  countForAdmin(where) {
    return prisma.rfqRequest.count({ where });
  },

  findById(id) {
    return prisma.rfqRequest.findUnique({ where: { id }, include: adminInclude });
  },

  update(id, data) {
    return prisma.rfqRequest.update({ where: { id }, data, include: adminInclude });
  },
};
