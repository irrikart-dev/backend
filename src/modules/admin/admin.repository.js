import { prisma } from '../../config/db.js';

const staffSelect = { id: true, email: true, name: true, role: true, permissions: true, createdAt: true };

// internal staff = ADMIN + SUB_ADMIN users
export default {
  listStaff() {
    return prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUB_ADMIN'] } },
      select: staffSelect,
      orderBy: { createdAt: 'asc' },
    });
  },

  findUserByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id) {
    return prisma.user.findUnique({ where: { id } });
  },

  updateUser(id, data) {
    return prisma.user.update({ where: { id }, data, select: staffSelect });
  },
};
