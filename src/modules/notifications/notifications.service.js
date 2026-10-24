import repository from './notifications.repository.js';
import * as email from './channels/email.channel.js';
import { push } from './channels/push.channel.js';
import env from '../../config/env.js';
import logger from '../../common/utils/logger.js';
import { AppError, NotFoundError } from '../../common/errors/AppError.js';

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

// ---- delivery: in-app row + push to every device + transactional email ----

// FCM data payloads only carry strings
const stringify = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));

async function pushToUser(userId, message) {
  const tokens = (await repository.tokensForUser(userId)).map((t) => t.fcmToken);
  if (!tokens.length) return;
  const { deadTokens } = await push.sendToTokens(tokens, message);
  if (deadTokens.length) await repository.deleteTokens(deadTokens);
}

// MSG91 drops variables into the template as raw HTML
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// one generic MSG91 template ({{name}}, {{title}}, {{body}}, {{order_number}}) for every
// transactional email — unset MSG91_TEMPLATE_TRANSACTIONAL to send push/in-app only.
// `html` (e.g. the order summary) goes under the body text, inside {{body}}.
// {{preheader}} is the inbox preview line — the template hides it in the email itself.
async function emailUser(user, { title, body, data, html = '' }) {
  if (!env.MSG91_TEMPLATE_TRANSACTIONAL || !user.email) return;
  await sendEmail({
    to: user.email,
    name: user.name,
    templateId: env.MSG91_TEMPLATE_TRANSACTIONAL,
    variables: {
      name: user.name ?? 'there',
      title,
      body: escapeHtml(body) + html,
      preheader: escapeHtml(body),
      order_number: data.orderNumber ?? '',
    },
  });
}

/**
 * Notifies one user: stores it for the in-app notification centre, then pushes it to
 * their devices and emails it. Never throws — a notification failing must not undo
 * the order/payment change that triggered it. Awaited by callers rather than fired
 * off, because Vercel may freeze the function as soon as the response is sent.
 */
export async function notifyUser(userId, { type, title, body, data = {}, emailHtml }) {
  try {
    const user = await repository.findUser(userId);
    if (!user || user.status !== 'ACTIVE') return;
    await repository.create({ userId, type, title, body, data });
    const results = await Promise.allSettled([
      pushToUser(userId, { title, body, data: stringify({ type, ...data }) }),
      emailUser(user, { title, body, data, html: emailHtml }),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') logger.error({ err: r.reason, userId, type }, 'notification channel failed');
    }
  } catch (err) {
    logger.error({ err, userId, type }, 'notification failed');
  }
}

// ---- order lifecycle copy ----

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * The order's lines as an email table — image, product, brand, option, quantity, price —
 * then subtotal, coupon discount and total. Inline styles only: email clients drop <style>.
 */
export function orderSummaryHtml(order) {
  const cell = 'padding:10px 0;border-bottom:1px solid #e7e8e9;vertical-align:top;';
  const rows = order.items.map((i) => {
    const p = i.variant.product;
    const image = p.images[0]?.url;
    const meta = [p.brand?.name, i.variant.size ?? i.variant.unit].filter(Boolean).map(escapeHtml).join(' · ');
    return `<tr>
<td style="${cell}width:56px;">${image?.startsWith('https://') ? `<img src="${escapeHtml(image)}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:6px;object-fit:cover;border:1px solid #e7e8e9;">` : ''}</td>
<td style="${cell}padding-left:12px;font-size:14px;line-height:1.4;color:#14171a;"><strong>${escapeHtml(p.title)}</strong>${meta ? `<br><span style="font-size:12px;color:#72757a;">${meta}</span>` : ''}<br><span style="font-size:12px;color:#72757a;">Qty ${i.quantity} × ${rupees(i.unitPrice)}</span></td>
<td style="${cell}padding-left:12px;text-align:right;font-size:14px;color:#14171a;white-space:nowrap;">${rupees(i.totalPrice)}</td>
</tr>`;
  });
  const subtotal = order.items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
  const discount = Math.max(subtotal - Number(order.totalAmount), 0);
  const line = (label, value, strong = false) =>
    `<tr><td colspan="2" style="padding:4px 0;font-size:${strong ? 15 : 13}px;color:${strong ? '#14171a' : '#43464a'};${strong ? 'font-weight:bold;' : ''}">${label}</td><td style="padding:4px 0;text-align:right;font-size:${strong ? 15 : 13}px;color:${strong ? '#14171a' : '#43464a'};${strong ? 'font-weight:bold;' : ''}white-space:nowrap;">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-collapse:collapse;">
${rows.join('\n')}
${line('Subtotal', rupees(subtotal))}
${discount > 0 ? line('Coupon discount', `− ${rupees(discount)}`) : ''}
${line('Delivery', 'Free')}
${line('Total', rupees(order.totalAmount), true)}
</table>`;
}

const CANCELLED_BY = {
  vendor: ' by the seller',
  admin: ' by IrriKart',
  system: ' because payment wasn’t completed in time',
};

// a refund from payments.refundOrder (or "manual" for COD) — a failed one is staff's to chase
function refundLine(refund) {
  if (!refund?.amount || refund.status === 'failed' || refund.status === 'none') return '';
  if (refund.status === 'manual') return ` We'll pay ${rupees(refund.amount)} back to you directly.`;
  return ` ${rupees(refund.amount)} is on its way back to your original payment method.`;
}

export const ORDER_COPY = {
  ORDER_CONFIRMED: (o) => [
    'Order confirmed',
    `We've got your order ${o.orderNumber} for ${rupees(o.totalAmount)}. We'll let you know when it ships.`,
  ],
  ORDER_SHIPPED: (o) => [
    'Your order is on its way',
    `${o.orderNumber} has shipped${o.shipment?.awbNumber ? ` — tracking number ${o.shipment.awbNumber}` : ''}.`,
  ],
  ORDER_DELIVERED: (o) => [
    'Order delivered',
    `${o.orderNumber} was delivered. Something not right? You can ask for a return within ${env.RETURN_WINDOW_DAYS} days.`,
  ],
  ORDER_CANCELLED: (o, { refund }) => [
    'Order cancelled',
    `${o.orderNumber} was cancelled${CANCELLED_BY[o.cancelledBy] ?? ''}.${refundLine(refund)}`,
  ],
  RETURN_APPROVED: (o, { note }) => [
    'Return approved',
    `Your return for ${o.orderNumber} is approved — we'll arrange the pickup.${note ? ` ${note}` : ''}`,
  ],
  RETURN_REJECTED: (o, { note }) => ['Return not accepted', `We couldn't accept your return for ${o.orderNumber}: ${note}`],
  RETURN_COMPLETED: (o, { refund }) => [
    'Return complete',
    `We've received the items from ${o.orderNumber}.${refundLine(refund)}`,
  ],
  REFUND_PROCESSED: (o, { amount }) => [
    'Refund processed',
    `${rupees(amount)} for ${o.orderNumber} has been sent back to your bank. It can take 5–7 working days to show.`,
  ],
};

/** Tells the order's customer about a lifecycle step. `extra` feeds the copy (refund, note, amount). Never throws. */
export async function notifyOrderEvent(orderId, type, extra = {}) {
  try {
    const order = await repository.findOrder(orderId);
    if (!order) return;
    const [title, body] = ORDER_COPY[type](order, extra);
    await notifyUser(order.userId, {
      type,
      title,
      body,
      data: { orderId: order.id, orderNumber: order.orderNumber },
      emailHtml: orderSummaryHtml(order),
    });
  } catch (err) {
    logger.error({ err, orderId, type }, 'order notification failed');
  }
}

// ---- customer: devices + notification centre ----

export async function registerDevice(userId, { fcmToken, platform }) {
  await repository.upsertDevice({ userId, fcmToken, platform });
}

export async function removeDevice(userId, { fcmToken }) {
  await repository.deleteDevice(userId, fcmToken);
}

function toDto(n) {
  return { id: n.id, type: n.type, title: n.title, body: n.body, data: n.data ?? {}, read: Boolean(n.readAt), createdAt: n.createdAt };
}

export async function listMine(userId, { page, limit }) {
  const [rows, total, unread] = await Promise.all([
    repository.listForUser(userId, { skip: (page - 1) * limit, take: limit }),
    repository.countForUser(userId),
    repository.countForUser(userId, { unreadOnly: true }),
  ]);
  return { items: rows.map(toDto), unread, page, limit, total };
}

export async function markRead(userId, id) {
  if (!(await repository.findForUser(userId, id))) throw new NotFoundError('Notification not found');
  await repository.markRead(userId, id);
}

export async function markAllRead(userId) {
  await repository.markAllRead(userId);
}

// ---- admin campaigns ----

function toCampaignDto(c) {
  return {
    id: c.id,
    title: c.title,
    body: c.body,
    link: c.link,
    recipients: c.recipients,
    pushSent: c.pushSent,
    pushFailed: c.pushFailed,
    createdAt: c.createdAt,
  };
}

/**
 * Broadcasts to every active customer: an in-app notification each, plus a push to
 * every device they're signed in on.
 * ponytail: loads every customer id and token into memory and sends inline — move to
 * an FCM topic plus a background job once the audience passes ~50k devices.
 */
export async function sendCampaign({ title, body, link }, sentById) {
  const users = await repository.activeCustomerIds();
  const campaign = await repository.createCampaign({ title, body, link: link ?? null, recipients: users.length, sentById });
  const data = { campaignId: campaign.id, ...(link ? { link } : {}) };

  for (let i = 0; i < users.length; i += 1000) {
    await repository.createMany(users.slice(i, i + 1000).map((u) => ({ userId: u.id, type: 'CAMPAIGN', title, body, data })));
  }

  const tokens = (await repository.customerTokens()).map((t) => t.fcmToken);
  let result = { sent: 0, failed: 0, deadTokens: [] };
  try {
    if (tokens.length) result = await push.sendToTokens(tokens, { title, body, data: stringify({ type: 'CAMPAIGN', ...data }) });
  } catch (err) {
    logger.error({ err, campaignId: campaign.id }, 'campaign push failed');
    result.failed = tokens.length - result.sent;
  }
  if (result.deadTokens.length) await repository.deleteTokens(result.deadTokens);

  return toCampaignDto(await repository.updateCampaign(campaign.id, { pushSent: result.sent, pushFailed: result.failed }));
}

export async function listCampaigns() {
  return (await repository.listCampaigns()).map(toCampaignDto);
}
