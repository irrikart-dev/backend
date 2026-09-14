import Razorpay from 'razorpay';
import env from '../../../config/env.js';
import { PaymentProvider } from './PaymentProvider.js';

export class RazorpayProvider extends PaymentProvider {
  #client = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });

  createOrder(options) {
    return this.#client.orders.create(options);
  }

  fetchPayment(paymentId) {
    return this.#client.payments.fetch(paymentId);
  }

  refund(paymentId, options) {
    return this.#client.payments.refund(paymentId, options);
  }

  verifyWebhookSignature(rawBody, signature) {
    return Razorpay.validateWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET);
  }

  clientConfig() {
    return { keyId: env.RAZORPAY_KEY_ID };
  }
}
