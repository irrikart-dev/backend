/** Rebuilds data/db.json from the bundled fixtures. Destroys dashboard edits. */
import { store } from '../services/store.js';

if (!process.argv.includes('--force')) {
  console.error('Refusing to reseed without --force (this deletes all dashboard edits).');
  process.exit(1);
}

await store.init();
const db = await store.reseed();
console.log(`Reseeded: ${db.products.length} products, ${db.categories.length} categories.`);
