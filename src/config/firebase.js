import admin from 'firebase-admin';
import env from './env.js';

// used for Phone Auth OTP verification and FCM push — single initialized app
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

export const firebaseAuth = admin.auth();
export const firebaseMessaging = admin.messaging();
