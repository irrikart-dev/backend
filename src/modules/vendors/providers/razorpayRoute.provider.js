import Razorpay from 'razorpay';
import env from '../../../config/env.js';

// separate from payments/providers/RazorpayProvider.js on purpose — that one is the
// swappable payment-gateway abstraction (PaymentProvider interface, one implementation
// per gateway). Route linked accounts aren't gateway-swappable the same way, so this is
// a plain wrapper, not another PaymentProvider.
class RazorpayRouteProvider {
  #client = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });

  // read-only lookup of a linked account admin has already created directly with
  // Razorpay — we never create or configure accounts ourselves, see vendors.service.js
  fetchAccount(accountId) {
    return this.#client.accounts.fetch(accountId);
  }

  transfer(paymentId, transfers) {
    return this.#client.payments.transfer(paymentId, { transfers });
  }
}

export const routeProvider = new RazorpayRouteProvider();
