import Razorpay from 'razorpay';
import env from '../../../config/env.js';

// payments.service.js talks to this interface, never to the razorpay SDK directly
// swapping gateways later = rewrite this file only
const client = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

export const createOrder = (options) => client.orders.create(options);
export const fetchPayment = (paymentId) => client.payments.fetch(paymentId);
export const refund = (paymentId, options) => client.payments.refund(paymentId, options);
