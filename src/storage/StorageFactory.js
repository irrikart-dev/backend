import { SupabaseStorage } from './SupabaseStorage.js';

export class StorageFactory {
  static create(provider) {
    switch (provider) {
      case 'supabase':
        return new SupabaseStorage();

      default:
        throw new Error(`Unknown storage provider: ${provider}`);
    }
  }
}
