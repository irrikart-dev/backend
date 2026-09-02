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

  // A single "*" means allow any origin (handy for local multi-port dev);
  // anything else is treated as an exact allowlist. See app.js.
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  logRequests: bool(process.env.LOG_REQUESTS, true),

  // One-time email codes for the sign-up flow (email verified -> set password).
  otp: {
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 10),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60),
    // How long the "email verified" proof is good for once the code is checked.
    signupTokenTtl: process.env.SIGNUP_TOKEN_TTL ?? '10m',
  },

  // Delivers the OTP. With no SMTP_HOST set, codes are logged to the server
  // console instead — lets the whole flow be tested with no mail provider.
  // Never leave that fallback in place in production (guarded below).
  mail: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? 'IrriKart <no-reply@irrikart.in>',
  },

  // Creates the real Firebase user once the email is verified. Either point
  // at a downloaded service account JSON (serviceAccountPath) or supply its
  // three fields directly — see docs in backend/README.md. Unset means
  // sign-up's final step responds 503 until this is configured.
  firebaseAdmin: {
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // .env stores literal "\n" inside the PEM; turn it back into real newlines.
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
};

if (config.env === 'production' && config.jwt.secret.includes('change-me')) {
  throw new Error('JWT_SECRET must be set to a real secret in production.');
}

if (config.env === 'production' && !config.mail.host) {
  throw new Error(
    'SMTP_HOST must be set in production — otherwise sign-up OTP codes are ' +
      'logged to the server console instead of emailed.',
  );
}
