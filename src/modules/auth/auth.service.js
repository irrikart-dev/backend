import * as repository from './auth.repository.js';
import { firebaseAuth } from '../../config/firebase.js';

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
