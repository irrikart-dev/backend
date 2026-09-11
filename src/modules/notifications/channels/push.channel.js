import { firebaseMessaging } from '../../../config/firebase.js';

// notifications.service.js dispatches to this, never touches firebase-admin directly
export const send = (token, { title, body, data }) =>
  firebaseMessaging.send({ token, notification: { title, body }, data });
