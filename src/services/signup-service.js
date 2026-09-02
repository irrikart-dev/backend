import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { config } from '../config/index.js';
import { HttpError } from '../utils/http-error.js';
import { firebaseAuth, isFirebaseAdminConfigured } from './firebase-admin.js';
import { sendOtpEmail } from './mailer.js';

const emailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address')
  .max(200)
  .transform((e) => e.toLowerCase());

const otpSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

/**
 * Pending email verifications: `email -> { otpHash, expiresAt, attempts, lastSentAt }`.
 *
 * In-memory and single-process, same tradeoff as the JSON catalogue store —
 * fine at phase-1 volume, first thing to move to Redis if this needs to scale
 * past one instance.
 */
const pending = new Map();

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

/** Step 1: email in, verification code emailed. */
export async function requestSignupOtp(rawEmail) {
  const email = emailSchema.parse(rawEmail);

  if (isFirebaseAdminConfigured() && (await userExists(email))) {
    throw HttpError.conflict('An account already exists for this email. Log in instead.');
  }

  const existing = pending.get(email);
  const cooldownMs = config.otp.resendCooldownSeconds * 1000;
  if (existing && Date.now() - existing.lastSentAt < cooldownMs) {
    const waitSeconds = Math.ceil((cooldownMs - (Date.now() - existing.lastSentAt)) / 1000);
    throw HttpError.conflict(`Please wait ${waitSeconds}s before requesting another code.`);
  }

  const otp = generateOtp();
  pending.set(email, {
    otpHash: await bcrypt.hash(otp, 10),
    expiresAt: Date.now() + config.otp.ttlMinutes * 60 * 1000,
    attempts: 0,
    lastSentAt: Date.now(),
  });

  await sendOtpEmail(email, otp);
  return { email };
}

/** Step 2: code in, a short-lived "this email is verified" token out. */
export async function verifySignupOtp(rawEmail, rawOtp) {
  const email = emailSchema.parse(rawEmail);
  const otp = otpSchema.parse(rawOtp);

  const record = pending.get(email);
  if (!record || Date.now() > record.expiresAt) {
    pending.delete(email);
    throw HttpError.badRequest('That code has expired. Request a new one.');
  }
  if (record.attempts >= config.otp.maxAttempts) {
    pending.delete(email);
    throw HttpError.badRequest('Too many incorrect attempts. Request a new code.');
  }

  const correct = await bcrypt.compare(otp, record.otpHash);
  if (!correct) {
    record.attempts += 1;
    throw HttpError.badRequest('Incorrect code. Please try again.');
  }

  // Single-use — the signup token is the only proof of verification from here on.
  pending.delete(email);

  const signupToken = jwt.sign({ email, purpose: 'signup' }, config.jwt.secret, {
    expiresIn: config.otp.signupTokenTtl,
  });
  return { signupToken };
}

/** Step 3: password in, the real Firebase account created, custom token out. */
export async function completeSignup(rawSignupToken, rawPassword) {
  const password = passwordSchema.parse(rawPassword);

  let claims;
  try {
    claims = jwt.verify(String(rawSignupToken ?? ''), config.jwt.secret);
  } catch {
    throw HttpError.unauthorized('Your verification has expired. Please start sign-up again.');
  }
  if (claims.purpose !== 'signup' || !claims.email) {
    throw HttpError.unauthorized('Invalid verification token.');
  }

  const auth = firebaseAuth();
  let userRecord;
  try {
    userRecord = await auth.createUser({
      email: claims.email,
      password,
      // The OTP step already proved the address is reachable.
      emailVerified: true,
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw HttpError.conflict('An account already exists for this email. Log in instead.');
    }
    throw err;
  }

  // Lets the app sign straight into the account it just watched get created,
  // with no second round trip through createUserWithEmailAndPassword.
  const customToken = await auth.createCustomToken(userRecord.uid);
  return { customToken, email: claims.email };
}

async function userExists(email) {
  try {
    await firebaseAuth().getUserByEmail(email);
    return true;
  } catch (err) {
    if (err.code === 'auth/user-not-found') return false;
    throw err;
  }
}
