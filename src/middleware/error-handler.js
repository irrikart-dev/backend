import { ZodError } from 'zod';

import { config } from '../config/index.js';
import { HttpError } from '../utils/http-error.js';

export function notFoundHandler(req, _res, next) {
  next(HttpError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Validation failed',
      // Flat `{field: message}` so the dashboard can drop these straight onto inputs.
      fields: Object.fromEntries(
        err.issues.map((i) => [i.path.join('.') || '_', i.message]),
      ),
    });
  }

  const status = err.status ?? 500;
  if (status >= 500) console.error(err);

  res.status(status).json({
    error: status >= 500 && config.env === 'production' ? 'Internal server error' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}
