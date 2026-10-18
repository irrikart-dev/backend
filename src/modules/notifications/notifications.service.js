import repository from './notifications.repository.js';
import * as email from './channels/email.channel.js';
import logger from '../../common/utils/logger.js';
import { AppError } from '../../common/errors/AppError.js';

// business logic + orchestration lives here, not in controller/repository

// returns MSG91's unique_id for the send. Throws a 502 on failure, so a caller
// that must not fail with the email (e.g. order placement) should catch it.
export async function sendEmail({ to, name, templateId, variables }) {
  try {
    const { data } = await email.send({ to, name, templateId, variables });
    // MSG91 can answer 200 with hasError:true — treat it like an HTTP error
    if (data?.hasError) throw Object.assign(new Error('MSG91 rejected the email'), { response: { data } });
    return data?.data?.unique_id ?? null;
  } catch (err) {
    const body = err.response?.data;
    // errors is { field: [msg] } — far more useful than the generic top-level message
    const reason = Object.values(body?.errors ?? {}).flat().join('; ') || body?.message || err.message;
    logger.error({ to, templateId, status: err.response?.status, body }, 'msg91 email send failed');
    throw new AppError(`Email send failed: ${reason}`, 502);
  }
}
