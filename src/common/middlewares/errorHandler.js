import { Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import logger from '../utils/logger.js';

// DB constraint failures that reach here are a client conflict, not a server bug —
// services check the common cases up front with friendlier messages; this is the
// backstop for races and anything they miss
function fromPrisma(err) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (err.code) {
    case 'P2002': {
      const fields = [].concat(err.meta?.target ?? []).join(', ');
      return { status: 409, message: fields ? `A record with this ${fields} already exists` : 'This record already exists' };
    }
    case 'P2003':
      return { status: 409, message: 'This record is still referenced by other data and can\'t be removed' };
    case 'P2025':
      return { status: 404, message: 'Record not found' };
    default:
      return null;
  }
}

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'File is too large (max 5MB)',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field — send the image as "file"',
};

// single place that turns any thrown error into an HTTP response
// every module funnels through this via asyncHandler -> next(err)
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  const known = fromPrisma(err);
  if (known) return res.status(known.status).json({ success: false, message: known.message });

  // express.json (body-parser) client errors — malformed JSON, oversize body, bad
  // charset — carry a 4xx status and expose:true
  if (typeof err.type === 'string' && err.expose && err.status >= 400 && err.status < 500) {
    const message = err.type === 'entity.parse.failed' ? 'Malformed JSON body' : err.message;
    return res.status(err.status).json({ success: false, message });
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: MULTER_MESSAGES[err.code] ?? err.message });
  }

  logger.error(err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
}
