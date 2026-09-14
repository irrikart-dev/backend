/** Base class every payment gateway must extend. */
export class PaymentProvider {
  async createOrder(options) {
    throw new Error('createOrder() must be implemented');
  }

  async fetchPayment(paymentId) {
    throw new Error('fetchPayment() must be implemented');
  }

  async refund(paymentId, options) {
    throw new Error('refund() must be implemented');
  }

  verifyWebhookSignature(rawBody, signature) {
    throw new Error('verifyWebhookSignature() must be implemented');
  }

  /** Whatever the client-side checkout widget needs to open (publishable key, etc). */
  clientConfig() {
    throw new Error('clientConfig() must be implemented');
  }
}
