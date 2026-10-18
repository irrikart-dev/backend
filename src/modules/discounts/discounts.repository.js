import { prisma } from '../../config/db.js';

const customerSelect = { customer: { select: { id: true, name: true, email: true, phone: true } } };

// orders that actually happened — unpaid and cancelled ones don't use up "first order"
const REAL_ORDER = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED'];

export default {
  // codes are stored upper-case but customers type them any way they like
  findByCode(code, client = prisma) {
    return client.coupon.findFirst({ where: { code: { equals: code, mode: 'insensitive' } } });
  },

  findById(id) {
    return prisma.coupon.findUnique({ where: { id } });
  },

  countUsages(couponId, client = prisma) {
    return client.couponUsage.count({ where: { couponId } });
  },

  countUsagesForUser(couponId, userId, client = prisma) {
    return client.couponUsage.count({ where: { couponId, userId } });
  },

  countRealOrders(userId) {
    return prisma.order.count({ where: { userId, status: { in: REAL_ORDER } } });
  },

  // what the app's offers list may show this customer: live listed coupons, plus any
  // issued to them personally
  listOffersFor(userId, now) {
    return prisma.coupon.findMany({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [{ OR: [{ listed: true, customerId: null }, { customerId: userId }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async usageCounts(couponIds, userId) {
    const [all, mine] = await Promise.all([
      prisma.couponUsage.groupBy({ by: ['couponId'], where: { couponId: { in: couponIds } }, _count: true }),
      prisma.couponUsage.groupBy({ by: ['couponId'], where: { couponId: { in: couponIds }, userId }, _count: true }),
    ]);
    const toMap = (rows) => new Map(rows.map((r) => [r.couponId, r._count]));
    return { all: toMap(all), mine: toMap(mine) };
  },

  // admin types an email or a phone number; phones are stored E.164 (+91...)
  findCustomerByContact(contact) {
    const digits = contact.replace(/\D/g, '');
    const phones = [contact, ...(digits.length >= 10 ? [`+91${digits.slice(-10)}`, `+${digits}`] : [])];
    return prisma.user.findFirst({
      where: { role: 'CUSTOMER', OR: [{ email: { equals: contact, mode: 'insensitive' } }, { phone: { in: phones } }] },
    });
  },

  createUsage({ couponId, userId, orderId }, client = prisma) {
    return client.couponUsage.create({ data: { couponId, userId, orderId } });
  },

  deleteUsageByOrderId(orderId, client = prisma) {
    return client.couponUsage.deleteMany({ where: { orderId } });
  },

  // ---- admin ----

  list() {
    return prisma.coupon.findMany({ include: customerSelect, orderBy: { createdAt: 'desc' } });
  },

  // every live usage with what its order was billed and its pre-discount line
  // items — cancelled orders give their usage back, so this is only real redemptions
  // ponytail: loads every usage row into memory; swap for a SQL GROUP BY once
  // coupon redemptions run into the tens of thousands
  listUsagesWithOrders() {
    return prisma.couponUsage.findMany({
      select: {
        couponId: true,
        userId: true,
        order: { select: { totalAmount: true, shippingAmount: true, items: { select: { quantity: true, unitPrice: true } } } },
      },
    });
  },

  create(data) {
    return prisma.coupon.create({ data, include: customerSelect });
  },

  update(id, data) {
    return prisma.coupon.update({ where: { id }, data });
  },

  delete(id) {
    return prisma.coupon.delete({ where: { id } });
  },
};
