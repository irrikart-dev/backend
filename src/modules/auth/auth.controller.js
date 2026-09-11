import * as service from './auth.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// req.firebaseUser is set by the authenticate middleware — token is already verified
// by the time we get here, this just upserts our mirror row
export const syncFirebaseUser = asyncHandler(async (req, res) => {
  const user = await service.syncFirebaseUser(req.firebaseUser);
  res.json({ success: true, data: user });
});

export const logoutAllDevices = asyncHandler(async (req, res) => {
  await service.logoutAllDevices(req.firebaseUser.uid);
  res.json({ success: true, data: { message: 'All sessions revoked' } });
});
