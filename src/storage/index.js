import env from '../config/env.js';
import { StorageFactory } from './StorageFactory.js';

export const storage = StorageFactory.create(env.STORAGE_PROVIDER);
