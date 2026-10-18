import { prisma } from '../../config/db.js';

const staffSelect = { id: true, email: true, name: true, role: true, permissions: true, createdAt: true };
const customerSelect = { id: true, name: true, phone: true, email: true, status: true, createdAt: true };
const PAID_STATUSES = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];

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

  // ---- customers ----

  listCustomers(where, { skip, take }) {
    return prisma.user.findMany({
      where,
      select: { ...customerSelect, _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  },

  countCustomers(where) {
    return prisma.user.count({ where });
  },

  // lifetime spend per customer — paid orders only, cancelled ones were refunded
  sumPaidOrdersByUser(userIds) {
    return prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, status: { in: PAID_STATUSES } },
      _sum: { totalAmount: true },
    });
  },

  findCustomer(id) {
    return prisma.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      select: {
        ...customerSelect,
        walletBalance: true,
        _count: { select: { orders: true } },
        // archived rows only exist for past orders — the order detail shows those
        addresses: { where: { archivedAt: null }, orderBy: { createdAt: 'desc' } },
        orders: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            vendor: { select: { storeName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
  },

  setUserStatus(id, status) {
    return prisma.user.update({ where: { id }, data: { status } });
  },
};
