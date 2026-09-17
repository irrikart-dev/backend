import repository from './vendors.repository.js';
import { routeProvider } from './providers/razorpayRoute.provider.js';
import { prisma } from '../../config/db.js';
import { slugify } from '../../common/utils/slugify.js';
import { NotFoundError, BadRequestError } from '../../common/errors/AppError.js';

async function uniqueSlug(base) {
  let slug = base;
  let n = 1;
  while (await repository.getVendorBySlug(slug)) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

// the linked account already exists in Razorpay by the time it gets here (see
// providers/razorpayRoute.provider.js) — this just confirms the id is real and reads
// its current activation_status, never creates or configures anything on Razorpay's side
async function verifyRazorpayAccount(razorpayAccountId) {
  try {
    const account = await routeProvider.fetchAccount(razorpayAccountId);
    return account.activation_status ?? null;
  } catch (err) {
    throw new BadRequestError('Could not verify Razorpay account id', {
      razorpayError: err?.error?.description ?? err.message,
    });
  }
}

function toVendorDto(v) {
  return {
    id: v.id,
    storeName: v.storeName,
    slug: v.slug,
    status: v.status,
    commissionPercent: Number(v.commissionPercent),
    legalBusinessName: v.legalBusinessName,
    contactEmail: v.contactEmail,
    contactPhone: v.contactPhone,
    razorpayAccountId: v.razorpayAccountId,
    routeStatus: v.routeStatus,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

export async function listVendors() {
  const rows = await repository.listVendors();
  return rows.map(toVendorDto);
}

export async function getVendor(id) {
  const row = await repository.getVendorById(id);
  if (!row) throw new NotFoundError('Vendor not found');
  return toVendorDto(row);
}

// internal, cross-module lookup (e.g. orders.service.js at checkout) — returns the raw
// row, not the DTO, since callers need fields like commissionPercent as-is
export function getVendorById(id) {
  return repository.getVendorById(id);
}

export function getVendorByOwnerUserId(userId) {
  return repository.getVendorByOwnerUserId(userId);
}

export async function createVendor(input) {
  const slug = await uniqueSlug(slugify(input.storeName));

  const ownerUser = await prisma.user.findUnique({ where: { email: input.ownerEmail } });
  if (!ownerUser) {
    throw new BadRequestError(
      'No account found for that email yet — the vendor must sign in once before being added'
    );
  }

  const routeStatus = await verifyRazorpayAccount(input.razorpayAccountId);

  const vendor = await repository.createVendor({
    ownerUserId: ownerUser.id,
    storeName: input.storeName,
    slug,
    commissionPercent: input.commissionPercent ?? 10,
    legalBusinessName: input.legalBusinessName ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    razorpayAccountId: input.razorpayAccountId,
    routeStatus,
  });

  await prisma.user.update({ where: { id: ownerUser.id }, data: { role: 'VENDOR' } });

  return toVendorDto(vendor);
}

export async function updateVendor(id, input) {
  const existing = await repository.getVendorById(id);
  if (!existing) throw new NotFoundError('Vendor not found');

  let routeStatus = existing.routeStatus;
  if (input.razorpayAccountId !== undefined && input.razorpayAccountId !== existing.razorpayAccountId) {
    routeStatus = input.razorpayAccountId ? await verifyRazorpayAccount(input.razorpayAccountId) : null;
  }

  const row = await repository.updateVendor(id, {
    ...(input.storeName !== undefined ? { storeName: input.storeName } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.commissionPercent !== undefined ? { commissionPercent: input.commissionPercent } : {}),
    ...(input.legalBusinessName !== undefined ? { legalBusinessName: input.legalBusinessName } : {}),
    ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
    ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
    ...(input.razorpayAccountId !== undefined ? { razorpayAccountId: input.razorpayAccountId, routeStatus } : {}),
  });

  return toVendorDto(row);
}

export async function refreshRouteStatus(id) {
  const existing = await repository.getVendorById(id);
  if (!existing) throw new NotFoundError('Vendor not found');
  if (!existing.razorpayAccountId) throw new BadRequestError('Vendor has no Razorpay account id set');

  const routeStatus = await verifyRazorpayAccount(existing.razorpayAccountId);
  const row = await repository.updateVendor(id, { routeStatus });
  return toVendorDto(row);
}

// called from payments.service.js after a payment captures — splits the vendor's cut
// to their Route account. Left to the caller to decide whether a failure here should
// block anything (it doesn't: the customer's payment already succeeded).
export function transferPayout(razorpayAccountId, providerPaymentId, amountPaise) {
  return routeProvider.transfer(providerPaymentId, [
    { account: razorpayAccountId, amount: amountPaise, currency: 'INR' },
  ]);
}

export async function listPayouts(vendorId) {
  const rows = await repository.listPayouts(vendorId);
  return rows.map((p) => ({
    orderNumber: p.order.orderNumber,
    amount: Number(p.order.vendorAmount),
    status: p.status,
    transferId: p.transferId,
    transferStatus: p.transferStatus,
    createdAt: p.createdAt,
  }));
}
