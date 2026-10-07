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

  // fail_existing:0 returns the existing customer for a repeat email/contact instead of erroring
  async createCustomer({ name, email, contact }) {
    const customer = await this.#client.customers.create({
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(contact ? { contact } : {}),
      fail_existing: 0,
    });
    return customer.id;
  }

  // Razorpay "tokens" — cards/UPI/wallets the customer chose to save at checkout
  async listSavedMethods(customerId) {
    const { items = [] } = await this.#client.customers.fetchTokens(customerId);
    return items.map((t) => ({
      id: t.id,
      method: t.method,
      card: t.card ? { last4: t.card.last4, network: t.card.network, issuer: t.card.issuer } : null,
      vpa: t.vpa?.username ? `${t.vpa.username}@${t.vpa.handle}` : null,
      wallet: t.wallet ?? null,
      bank: t.bank ?? null,
      createdAt: t.created_at ? new Date(t.created_at * 1000) : null,
    }));
  }

  deleteSavedMethod(customerId, methodId) {
    return this.#client.customers.deleteToken(customerId, methodId);
  }

  verifyWebhookSignature(rawBody, signature) {
    return Razorpay.validateWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET);
  }

  // signed with the API secret (not the webhook secret) over "orderId|paymentId"
  verifyPaymentSignature({ providerOrderId, providerPaymentId, signature }) {
    return Razorpay.validateWebhookSignature(
      `${providerOrderId}|${providerPaymentId}`,
      signature,
      env.RAZORPAY_KEY_SECRET
    );
  }

  clientConfig() {
    return { keyId: env.RAZORPAY_KEY_ID };
  }
}
