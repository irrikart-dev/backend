import nodemailer from 'nodemailer';

import { config } from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (!config.mail.host) return null;
  transporter ??= nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  });
  return transporter;
}

/** Sends the sign-up verification code, or logs it if SMTP is not configured. */
export async function sendOtpEmail(to, otp) {
  const subject = 'Your IrriKart verification code';
  const text = `Your IrriKart verification code is ${otp}. It expires in ${config.otp.ttlMinutes} minutes.\n\nIf you did not request this, you can ignore this email.`;
  const html = `
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto">
      <p>Your IrriKart verification code is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#67BD50">${otp}</p>
      <p style="color:#72757A;font-size:13px">
        It expires in ${config.otp.ttlMinutes} minutes. If you did not request this,
        you can ignore this email.
      </p>
    </div>`;

  const transport = getTransporter();
  if (!transport) {
    // Dev fallback — see the guard in config/index.js that forbids this in
    // production. Lets the sign-up flow be exercised with no mail provider.
    console.log(`\n[dev] OTP for ${to}: ${otp}\n`);
    return;
  }
  await transport.sendMail({ from: config.mail.from, to, subject, text, html });
}
