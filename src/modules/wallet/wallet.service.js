import repository from './wallet.repository.js';
import { BadRequestError } from '../../common/errors/AppError.js';

// Store credit. Every refund lands here instead of going back to the bank card/UPI —
// see payments.service.js refundOrderToWallet. User.walletBalance is the balance; the
// WalletTransaction rows are its ledger and always add up to it.
// ponytail: credit only for now — spending the balance at checkout comes later (it
// needs the vendor Route transfer split for part-wallet, part-gateway orders).

/**
 * Applies one signed balance change inside the caller's transaction and records it.
 * A debit that would take the balance below zero throws.
 */
export async function applyChange(tx, { userId, amount, type, reason, orderId = null, createdById = null }) {
  const { count } = await repository.changeBalance(userId, amount, tx);
  if (count === 0) throw new BadRequestError('Not enough wallet balance');
  const { walletBalance } = await repository.balance(userId, tx);
  return repository.createTransaction(
    { userId, amount, balanceAfter: walletBalance, type, reason: reason.slice(0, 250), orderId, createdById },
    tx
  );
}

export const creditedForOrder = (orderId, client) => repository.creditedForOrder(orderId, client);

function toDto(t) {
  return {
    id: t.id,
    amount: Number(t.amount),
    balanceAfter: Number(t.balanceAfter),
    type: t.type,
    reason: t.reason,
    order: t.order ?? null,
    createdAt: t.createdAt,
  };
}

export async function getMine(userId) {
  const [{ walletBalance }, rows] = await Promise.all([repository.balance(userId), repository.listForUser(userId)]);
  return { balance: Number(walletBalance), currency: 'INR', transactions: rows.map(toDto) };
}

// ---- admin ----

/** Every refund credited to a wallet, newest first, with the total for the filtered set. */
export async function listRefundsForAdmin({ search, from, to, page, limit }) {
  const clauses = [{ type: 'REFUND' }];
  if (from) clauses.push({ createdAt: { gte: from } });
  if (to) clauses.push({ createdAt: { lte: to } });
  if (search) {
    const contains = (field) => ({ [field]: { contains: search, mode: 'insensitive' } });
    clauses.push({
      OR: [contains('reason'), { order: contains('orderNumber') }, { user: { OR: ['name', 'phone', 'email'].map(contains) } }],
    });
  }
  const where = { AND: clauses };
  const [rows, total, credited] = await Promise.all([
    repository.listForAdmin(where, { skip: (page - 1) * limit, take: limit }),
    repository.countForAdmin(where),
    repository.sumForAdmin(where),
  ]);
  return {
    items: rows.map((t) => ({ ...toDto(t), customer: t.user.name ?? t.user.phone ?? t.user.email, manual: Boolean(t.createdById) })),
    page,
    limit,
    total,
    summary: { credited },
  };
}

export async function balanceFor(userId) {
  return Number((await repository.balance(userId))?.walletBalance ?? 0);
}
