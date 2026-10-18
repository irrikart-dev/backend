import { prisma } from '../../config/db.js';

const ID = 'default';

export default {
  // the row is created on first read, so callers never deal with "no settings yet"
  get() {
    return prisma.storeSettings.upsert({ where: { id: ID }, create: { id: ID }, update: {} });
  },

  update(data) {
    return prisma.storeSettings.upsert({ where: { id: ID }, create: { id: ID, ...data }, update: data });
  },
};
