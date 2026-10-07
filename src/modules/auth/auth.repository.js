import { prisma } from '../../config/db.js';

export const findByFirebaseUid = (firebaseUid) => prisma.user.findUnique({ where: { firebaseUid } });

export const createFromFirebase = ({ firebaseUid, phone, email }) =>
  prisma.user.create({ data: { firebaseUid, phone, email } });

export const updateName = (id, name) => prisma.user.update({ where: { id }, data: { name } });
