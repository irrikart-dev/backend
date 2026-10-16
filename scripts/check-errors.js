/**
 * Offline self-check for errorHandler's mapping of DB and upload errors:
 *   node scripts/check-errors.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { errorHandler } from '../src/common/middlewares/errorHandler.js';
import { NotFoundError } from '../src/common/errors/AppError.js';

function respond(err) {
  const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  errorHandler(err, {}, res, () => {});
  return res;
}
const prismaError = (code, meta) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x', meta });

assert.equal(respond(prismaError('P2002', { target: ['razorpayAccountId'] })).code, 409);
assert.match(respond(prismaError('P2002', { target: ['razorpayAccountId'] })).body.message, /razorpayAccountId/);
assert.equal(respond(prismaError('P2003')).code, 409);
assert.equal(respond(prismaError('P2025')).code, 404);
assert.equal(respond(Object.assign(new Error('File too large'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' })).code, 400);
assert.equal(respond(new NotFoundError('nope')).code, 404);
// the 500 path also logs the error via pino (expected output)
assert.equal(respond(new Error('boom: expected test error')).code, 500);

console.log('error mapping checks passed');
process.exit(0);
