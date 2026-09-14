import env from '../../../config/env.js';
import { PaymentProviderFactory } from './PaymentProviderFactory.js';

export const paymentProvider = PaymentProviderFactory.create(env.PAYMENT_PROVIDER);
