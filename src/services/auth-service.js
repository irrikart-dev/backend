import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { config } from '../config/index.js';
import { HttpError } from '../utils/http-error.js';

// Phase 1 ships a single dummy admin from env. The password is hashed at boot
// so the plaintext never sits in memory beyond startup, and so replacing this
// with a database-backed user table is a drop-in change.
const ADMIN = {
  id: 'admin-1',
  email: config.admin.email,
  name: config.admin.name,
  role: 'admin',
  passwordHash: bcrypt.hashSync(config.admin.password, 10),
};

export function publicAdmin() {
  const { passwordHash, ...rest } = ADMIN;
  return rest;
}

export async function login(email, password) {
  const normalised = String(email ?? '').trim().toLowerCase();
  const ok =
    normalised === ADMIN.email &&
    (await bcrypt.compare(String(password ?? ''), ADMIN.passwordHash));

  // One generic message for both failure modes — never leak which half was wrong.
  if (!ok) throw HttpError.unauthorized('Invalid email or password');

  const token = jwt.sign(
    { sub: ADMIN.id, email: ADMIN.email, role: ADMIN.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
  return { token, user: publicAdmin() };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    throw HttpError.unauthorized('Session expired — please log in again');
  }
}
