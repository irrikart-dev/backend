import axios from 'axios';
import env from '../../../config/env.js';

// notifications.service.js dispatches to this, never calls MSG91's HTTP API directly
// swap provider later = rewrite this file only
const client = axios.create({
  baseURL: 'https://api.msg91.com/api/v5/email',
  headers: { authkey: env.MSG91_AUTH_KEY },
});

export const send = ({ to, subject, templateId, variables }) =>
  client.post('/send', {
    to: [{ email: to }],
    from: { email: env.MSG91_EMAIL_DOMAIN },
    domain: env.MSG91_EMAIL_DOMAIN,
    subject,
    template_id: templateId,
    variables,
  });
