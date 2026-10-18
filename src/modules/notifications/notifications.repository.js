import { prisma } from '../../config/db.js';

export default {
  // a token belongs to whoever signed in on that device last
  upsertDevice({ userId, fcmToken, platform }) {
    return prisma.deviceToken.upsert({
      where: { fcmToken },
      create: { userId, fcmToken, platform },
      update: { userId, platform },
    });
  },

  deleteDevice(userId, fcmToken) {
    return prisma.deviceToken.deleteMany({ where: { userId, fcmToken } });
  },

  deleteTokens(fcmTokens) {
    return prisma.deviceToken.deleteMany({ where: { fcmToken: { in: fcmTokens } } });
  },

  tokensForUser(userId) {
    return prisma.deviceToken.findMany({ where: { userId }, select: { fcmToken: true } });
  },

  // every device of every active customer — the campaign audience
  customerTokens() {
    return prisma.deviceToken.findMany({
      where: { user: { role: 'CUSTOMER', status: 'ACTIVE' } },
      select: { fcmToken: true },
    });
  },

  activeCustomerIds() {
    return prisma.user.findMany({ where: { role: 'CUSTOMER', status: 'ACTIVE' }, select: { id: true } });
  },

  findUser(userId) {
    return prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, status: true } });
  },

  findOrder(orderId) {
    return prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        userId: true,
        cancelledBy: true,
        cancelReason: true,
        shipment: { select: { awbNumber: true } },
      },
    });
  },

  create(data) {
    return prisma.notification.create({ data });
  },

  createMany(rows) {
    return prisma.notification.createMany({ data: rows });
  },

  listForUser(userId, { skip, take }) {
    return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip, take });
  },

  countForUser(userId, { unreadOnly = false } = {}) {
    return prisma.notification.count({ where: { userId, ...(unreadOnly ? { readAt: null } : {}) } });
  },

  markRead(userId, id) {
    return prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  },

  markAllRead(userId) {
    return prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  },

  findForUser(userId, id) {
    return prisma.notification.findFirst({ where: { id, userId } });
  },

  createCampaign(data) {
    return prisma.notificationCampaign.create({ data });
  },

  updateCampaign(id, data) {
    return prisma.notificationCampaign.update({ where: { id }, data });
  },

  listCampaigns() {
    return prisma.notificationCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  },
};
