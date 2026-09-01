import { config } from './config/index.js';
import { createApp } from './app.js';
import { store } from './services/store.js';

await store.init();

createApp().listen(config.port, () => {
  console.log(`IrriKart API listening on http://localhost:${config.port}/api/v1`);
  console.log(`  catalogue: ${store.products.length} products, ${store.categories.length} categories`);
  console.log(`  admin login: ${config.admin.email}`);
});
