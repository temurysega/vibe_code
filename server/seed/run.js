// Пересоздать демо-данные вручную: npm run seed
import { config } from '../config.js';
import { Store } from '../db.js';
import { seed } from './seed.js';

const store = new Store(config.dbFile);
await seed(store);
store.close();
console.log('Готово: демо-данные созданы в', config.dbFile);
