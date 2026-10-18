import { firebaseMessaging } from '../../../config/firebase.js';

// tokens FCM says will never work again — the app was uninstalled or the token rotated
const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

// notifications.service.js dispatches to this, never touches firebase-admin directly.
// An object (not bare exports) so the order-flow check can stub it.
export const push = {
  /** Sends one notification to many devices. FCM data values must be strings. */
  async sendToTokens(tokens, { title, body, data = {} }) {
    const result = { sent: 0, failed: 0, deadTokens: [] };
    // FCM caps a multicast at 500 tokens
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const res = await firebaseMessaging.sendEachForMulticast({ tokens: batch, notification: { title, body }, data });
      res.responses.forEach((r, j) => {
        if (r.success) result.sent += 1;
        else {
          result.failed += 1;
          if (DEAD_TOKEN_CODES.has(r.error?.code)) result.deadTokens.push(batch[j]);
        }
      });
    }
    return result;
  },
};
