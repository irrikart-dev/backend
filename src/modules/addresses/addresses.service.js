import repository from './addresses.repository.js';
import { NotFoundError } from '../../common/errors/AppError.js';

// Rules:
// - exactly one default once a user has any address (first one is always default,
//   setting a new default clears the old, removing the default promotes the newest)
// - an address an order already uses is never edited or deleted in place — it's
//   archived and (on edit) replaced by a new row, so orders/invoices keep what they shipped to

function toAddressDto(a) {
  return {
    id: a.id,
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: a.isDefault,
  };
}

const ADDRESS_FIELDS = ['name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'];

async function getOwned(userId, id) {
  const existing = await repository.findForUser(id, userId);
  if (!existing) throw new NotFoundError('Address not found');
  return existing;
}

export async function listForUser(userId) {
  const rows = await repository.listForUser(userId);
  return rows.map(toAddressDto);
}

export async function create(userId, input) {
  const row = await repository.transaction(async (tx) => {
    const isFirst = (await repository.countForUser(userId, tx)) === 0;
    const isDefault = isFirst || input.isDefault === true;
    if (isDefault) await repository.clearDefault(userId, tx);
    return repository.create({ ...input, userId, isDefault }, tx);
  });
  return toAddressDto(row);
}

export async function update(userId, id, input) {
  const existing = await getOwned(userId, id);
  const row = await repository.transaction(async (tx) => {
    // isDefault:false on the current default is ignored — it would leave the user with
    // none; making another address default (here or via /default) is how it moves
    const isDefault = input.isDefault === true || existing.isDefault;
    if (isDefault && !existing.isDefault) await repository.clearDefault(userId, tx);

    const fields = Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, input[f] !== undefined ? input[f] : existing[f]]));
    const changed = ADDRESS_FIELDS.some((f) => (fields[f] ?? null) !== (existing[f] ?? null));
    if (!changed) return isDefault === existing.isDefault ? existing : repository.update(id, { isDefault }, tx);
    if (await repository.isUsedByOrder(id, tx)) {
      await repository.archive(id, tx);
      return repository.create({ ...fields, userId, isDefault }, tx);
    }
    return repository.update(id, { ...fields, isDefault }, tx);
  });
  return toAddressDto(row);
}

export async function remove(userId, id) {
  const existing = await getOwned(userId, id);
  await repository.transaction(async (tx) => {
    if (await repository.isUsedByOrder(id, tx)) await repository.archive(id, tx);
    else await repository.delete(id, tx);
    if (existing.isDefault) await repository.promoteNewest(userId, tx);
  });
}

export async function setDefault(userId, id) {
  await getOwned(userId, id);
  await repository.transaction(async (tx) => {
    await repository.clearDefault(userId, tx);
    await repository.update(id, { isDefault: true }, tx);
  });
}

// used by orders.service.checkout — not exposed as its own route. Archived addresses
// aren't returned, so an order can't be placed to one.
export async function findOwnedByUser(id, userId) {
  return repository.findForUser(id, userId);
}
