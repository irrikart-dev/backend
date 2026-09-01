import { HttpError } from '../utils/http-error.js';
import { verifyToken } from '../services/auth-service.js';

/** Gate for every `/api/v1/admin/*` route. Expects `Authorization: Bearer <jwt>`. */
export function requireAdmin(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(HttpError.unauthorized('Missing bearer token'));
  }
  try {
    const claims = verifyToken(token);
    if (claims.role !== 'admin') return next(HttpError.forbidden());
    req.admin = claims;
    next();
  } catch (err) {
    next(err);
  }
}
