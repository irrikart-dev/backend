import { readFileSync } from 'node:fs';

import admin from 'firebase-admin';

import { config } from '../config/index.js';
import { HttpError } from '../utils/http-error.js';

let app; // undefined = not attempted yet, null = attempted and unavailable

/** Initialises the Admin SDK once, from whichever credential source is set. */
function init() {
  if (app !== undefined) return app;

  const { serviceAccountPath, projectId, clientEmail, privateKey } = config.firebaseAdmin;

  try {
    if (serviceAccountPath) {
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else if (projectId && clientEmail && privateKey) {
      app = admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    } else {
      app = null;
    }
  } catch (err) {
    console.error('Firebase Admin SDK failed to initialise:', err.message);
    app = null;
  }
  return app;
}

export function isFirebaseAdminConfigured() {
  return init() !== null;
}

/** The Admin Auth instance, or a clear 503 if credentials were never set. */
export function firebaseAuth() {
  const initialised = init();
  if (!initialised) {
    throw HttpError.serviceUnavailable(
      'Sign-up is not fully configured on the server yet. Contact support.',
    );
  }
  return admin.auth(initialised);
}
