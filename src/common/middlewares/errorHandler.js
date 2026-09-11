import { AppError } from '../errors/AppError.js';
import logger from '../utils/logger.js';

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

  logger.error(err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
}
