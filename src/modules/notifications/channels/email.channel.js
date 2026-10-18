import axios from 'axios';
import env from '../../../config/env.js';

// notifications.service.js dispatches to this, never calls MSG91's HTTP API directly
// swap provider later = rewrite this file only
const client = axios.create({
  baseURL: 'https://control.msg91.com/api/v5/email',
  headers: { authkey: env.MSG91_AUTH_KEY, accept: 'application/json' },
});

// one templated email per call — subject and body live in the MSG91 template,
// `variables` fill its {{placeholders}}
export const send = ({ to, name, templateId, variables = {} }) =>
  client.post('/send', {
    recipients: [{ to: [{ email: to, name: name || to }], variables }],
    from: { email: env.MSG91_EMAIL_FROM },
    domain: env.MSG91_EMAIL_DOMAIN,
    template_id: templateId,
  });
