import * as repository from './auth.repository.js';
import { firebaseAuth } from '../../config/firebase.js';
import { ForbiddenError } from '../../common/errors/AppError.js';

// runs on POST /auth/firebase/sync — decodedToken is already verified by the
// authenticate middleware, this just mirrors it into our own User table
export async function syncFirebaseUser(decodedToken) {
  const existing = await repository.findByFirebaseUid(decodedToken.uid);
  if (existing) return existing;

  return repository.createFromFirebase({
    firebaseUid: decodedToken.uid,
    phone: decodedToken.phone_number ?? null,
    email: decodedToken.email ?? null,
  });
}

// invalidates every ID token issued before now for this Firebase user —
// takes effect on each device's next request because authenticate() checks revocation
export function logoutAllDevices(firebaseUid) {
  return firebaseAuth.revokeRefreshTokens(firebaseUid);
}

export function updateProfile(userId, { name }) {
  return repository.updateName(userId, name);
}

// Self-service account deletion (Google Play policy: any app that creates an
// account must let the user delete it in-app).
//
// Personal data is erased: profile fields, saved addresses not tied to an
// order, carts that never became orders, wishlist, recently viewed, reviews,
// RFQs, device tokens and notifications. Placed orders — with the delivery
// address they shipped to — are retained, unlinked from any identity, because
// Indian GST law requires invoice records to be kept. The Firebase Auth user
// is deleted last.
//
// Idempotent: if the DB row was already anonymised (e.g. the Firebase delete
// failed on a previous attempt) only the Firebase delete is retried.
export async function deleteAccount(firebaseUid) {
  const user = await repository.findByFirebaseUid(firebaseUid);
  if (user) {
    if (user.role !== 'CUSTOMER') {
      throw new ForbiddenError(
        'Admin and vendor accounts cannot be deleted from the app. Contact IrriKart support.',
      );
    }
    await repository.anonymiseAndPurge(user.id);
  }

  try {
    await firebaseAuth.deleteUser(firebaseUid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }
}
