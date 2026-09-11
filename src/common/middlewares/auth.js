import { firebaseAuth } from '../../config/firebase.js';
import { prisma } from '../../config/db.js';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError.js';

// verifies a Firebase ID token, attaches req.firebaseUser (raw decoded claims).
// checkRevoked:true costs one extra call to Firebase per request but is what makes
// admin.auth().revokeRefreshTokens(uid) — logout-all-devices — take effect immediately
// instead of waiting up to an hour for the token to expire on its own.
export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing token'));
  }

  try {
    req.firebaseUser = await firebaseAuth.verifyIdToken(header.split(' ')[1], true);
    next();
  } catch (err) {
    if (err.code === 'auth/id-token-revoked') {
      return next(new UnauthorizedError('Session revoked, please log in again'));
    }
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

// resolves the DB User row for the verified Firebase user and attaches it as req.user.
// runs after authenticate; separate step because not every route needs the DB hit
// (a route that only cares about identity can stop at req.firebaseUser).
export async function loadUser(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { firebaseUid: req.firebaseUser.uid } });
    if (!user) return next(new UnauthorizedError('No account linked to this Firebase user'));
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// role gate — reads role off our own User row (req.user), not the Firebase token,
// since role is app-level state Firebase has no concept of. Requires a middleware
// upstream (e.g. loadUser) to have already attached req.user from the DB.
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user?.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };
}
