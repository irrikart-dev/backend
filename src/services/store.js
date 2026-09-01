import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const SEED_DIR = path.join(ROOT, 'src', 'data');

/**
 * File-backed JSON store.
 *
 * Deliberately dependency-free for phase 1: the whole catalogue is a few
 * hundred KB and every read is served from an in-memory cache, so a real
 * database buys nothing yet. Everything goes through this module, so the
 * swap to Postgres/Mongo later is a one-file change — no route touches the
 * filesystem directly.
 */
class Store {
  /** @type {{products: any[], categories: any[], meta: any} | null} */
  #db = null;
  /** @type {Promise<void> | null} Serialises concurrent writes. */
  #writing = null;

  async init() {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    try {
      this.#db = JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.#db = await this.#buildFromSeed();
      await this.#flush();
    }
    return this;
  }

  /** Rebuilds the database from the bundled seed fixtures, discarding edits. */
  async reseed() {
    this.#db = await this.#buildFromSeed();
    await this.#flush();
    return this.#db;
  }

  async #buildFromSeed() {
    const [products, categories] = await Promise.all([
      readJson(path.join(SEED_DIR, 'seed-products.json')),
      readJson(path.join(SEED_DIR, 'seed-categories.json')),
    ]);
    const now = new Date().toISOString();
    return {
      meta: { seededAt: now, version: 1 },
      categories: categories.map((c, i) => ({
        id: c.id,
        name: c.name,
        blurb: c.blurb,
        image: c.image,
        imageUrl: null,
        sortOrder: i,
        source: 'seed',
        active: true,
        createdAt: now,
        updatedAt: now,
      })),
      products: products.map((p) => ({
        id: randomUUID(),
        // The catalogue scraped from the client's site has no SKUs; derive a
        // stable one from the slug so admins have something to edit from day 1.
        sku: skuFromSlug(p.slug),
        slug: p.slug,
        name: p.name,
        category: p.category,
        image: p.image,
        imageUrl: null,
        tagline: p.tagline,
        description: p.description,
        features: p.features ?? [],
        specs: p.specs ?? [],
        unit: p.unit,
        mrp: p.mrp,
        price: p.price,
        rating: p.rating,
        reviewCount: p.reviewCount,
        inStock: p.inStock,
        stockQty: p.inStock ? 100 : 0,
        featured: p.featured,
        active: true,
        // `seed` products came from the Irigacio site and are protected from
        // deletion; `admin` products were created in the dashboard.
        source: 'seed',
        createdAt: now,
        updatedAt: now,
      })),
    };
  }

  get db() {
    if (!this.#db) throw new Error('Store not initialised — call store.init() first.');
    return this.#db;
  }

  get products() { return this.db.products; }
  get categories() { return this.db.categories; }

  /** Persists the current snapshot; concurrent calls are queued, not raced. */
  async save() {
    this.#writing = (this.#writing ?? Promise.resolve()).then(() => this.#flush());
    return this.#writing;
  }

  async #flush() {
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.#db, null, 2), 'utf8');
    await fs.rename(tmp, DB_FILE); // atomic — never leaves a half-written db
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

/** `arrow-dripper-assembly` -> `IK-ARR-DRI-ASS` */
export function skuFromSlug(slug) {
  const parts = slug
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w.slice(0, 3));
  return ['IK', ...parts].join('-');
}

export const store = new Store();
export { randomUUID as newId };
