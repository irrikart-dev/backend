import { PrismaClient } from '@prisma/client';

// one prisma instance for the whole process, imported by every repository
export const prisma = new PrismaClient();
