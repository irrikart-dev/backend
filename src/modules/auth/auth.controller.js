import * as service from './auth.service.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// what clients get back about the caller — never firebaseUid, razorpayCustomerId or
// other internal columns. role/permissions drive the dashboard's access checks.
function toUserDto(u) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    permissions: u.permissions,
    createdAt: u.createdAt,
  };
}

// req.firebaseUser is set by the authenticate middleware — token is already verified
// by the time we get here, this just upserts our mirror row
export const syncFirebaseUser = asyncHandler(async (req, res) => {
  const user = await service.syncFirebaseUser(req.firebaseUser);
  res.json({ success: true, data: toUserDto(user) });
});

export const logoutAllDevices = asyncHandler(async (req, res) => {
  await service.logoutAllDevices(req.firebaseUser.uid);
  res.json({ success: true, data: { message: 'All sessions revoked' } });
});

export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: toUserDto(req.user) });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await service.updateProfile(req.user.id, req.validated.body);
  res.json({ success: true, data: toUserDto(user) });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  await service.deleteAccount(req.firebaseUser.uid);
  res.json({ success: true, data: { message: 'Account deleted' } });
});
