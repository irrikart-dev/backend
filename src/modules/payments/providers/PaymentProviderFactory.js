import { RazorpayProvider } from './RazorpayProvider.js';

export class PaymentProviderFactory {
  static create(provider) {
    switch (provider) {
      case 'razorpay':
        return new RazorpayProvider();

      default:
        throw new Error(`Unknown payment provider: ${provider}`);
    }
  }
}
