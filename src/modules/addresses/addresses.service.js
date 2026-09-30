import repository from './addresses.repository.js';
import { NotFoundError } from '../../common/errors/AppError.js';

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

export async function listForUser(userId) {
  const rows = await repository.listForUser(userId);
  return rows.map(toAddressDto);
}

export async function create(userId, input) {
  // there should never be zero default addresses once one exists — the
  // first address a user ever adds is always their default, regardless of
  // what they passed
  const isFirst = (await repository.countForUser(userId)) === 0;
  const row = await repository.create(userId, {
    ...input,
    isDefault: isFirst ? true : (input.isDefault ?? false),
  });
  return toAddressDto(row);
}

export async function update(userId, id, input) {
  const existing = await repository.findForUser(id, userId);
  if (!existing) throw new NotFoundError('Address not found');
  const row = await repository.update(id, input);
  return toAddressDto(row);
}

export async function remove(userId, id) {
  const existing = await repository.findForUser(id, userId);
  if (!existing) throw new NotFoundError('Address not found');
  await repository.delete(id);
}

export async function setDefault(userId, id) {
  const existing = await repository.findForUser(id, userId);
  if (!existing) throw new NotFoundError('Address not found');
  await repository.setDefault(id, userId);
}

// used by orders.service.checkout — not exposed as its own route
export async function findOwnedByUser(id, userId) {
  return repository.findForUser(id, userId);
}
