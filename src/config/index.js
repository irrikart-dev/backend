import 'dotenv/config';

const bool = (v, fallback) => (v === undefined ? fallback : v === 'true');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  env: process.env.NODE_ENV ?? 'development',

  jwt: {
    secret: process.env.JWT_SECRET ?? 'irrikart-dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  },

  // Phase-1 dummy admin. There is exactly one, defined by env, hashed at boot.
  // Swap for a real users table when multi-admin lands.
  admin: {
    email: (process.env.ADMIN_EMAIL ?? 'admin@irrikart.in').toLowerCase(),
    password: process.env.ADMIN_PASSWORD ?? 'Admin@123',
    name: process.env.ADMIN_NAME ?? 'IrriKart Admin',
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  logRequests: bool(process.env.LOG_REQUESTS, true),
};

if (config.env === 'production' && config.jwt.secret.includes('change-me')) {
  throw new Error('JWT_SECRET must be set to a real secret in production.');
}
