import { z } from 'zod';

import { HttpError } from '../utils/http-error.js';
import { slugify, uniqueSlug } from '../utils/slug.js';
import { store } from './store.js';

export const categorySchema = z.object({
  id: z.string().max(60).optional(),
  name: z.string().min(2).max(80),
  blurb: z.string().max(200).default(''),
  imageUrl: z.string().url().max(500).nullable().default(null),
  active: z.boolean().default(true),
});

export function toPublicCategory(c) {
  return {
    id: c.id,
    name: c.name,
    blurb: c.blurb,
    image: c.image,
    imageUrl: c.imageUrl,
    sortOrder: c.sortOrder,
    source: c.source,
  };
}

export function listCategories({ includeInactive = false } = {}) {
  const rows = includeInactive ? store.categories : store.categories.filter((c) => c.active);
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createCategory(input) {
  const data = categorySchema.parse(input);
  const id = uniqueSlug(
    slugify(data.id || data.name),
    store.categories.map((c) => c.id),
  );
  const now = new Date().toISOString();
  const category = {
    ...data,
    id,
    image: null,
    sortOrder: store.categories.length,
    source: 'admin',
    createdAt: now,
    updatedAt: now,
  };
  store.categories.push(category);
  await store.save();
  return category;
}

export async function updateCategory(id, input) {
  const category = store.categories.find((c) => c.id === id);
  if (!category) throw HttpError.notFound(`No category with id ${id}`);
  const patch = categorySchema.omit({ id: true }).partial().parse(input);
  Object.assign(category, patch, { updatedAt: new Date().toISOString() });
  await store.save();
  return category;
}
