import { LocalStorage } from './LocalStorage';
import { StorageInterface } from './StorageInterface';
import { SupabaseStorage } from './SupabaseStorage';
import { GCSStorage } from './GCSStorage';
import { getLogger } from '../logger';
import { S3Storage } from './S3Storage';

const logger = getLogger('StorageFactory');

export class StorageFactory {
  private static instance: StorageInterface;

  static getStorage(): StorageInterface {
    if (!StorageFactory.instance) {
      const storageType = process.env.BLOB_STORAGE_TYPE;
      logger.info(`[StorageFactory] Requested storage type: ${storageType}`);
      if (storageType === 'supabase') {
        logger.info('[StorageFactory] Initializing SupabaseStorage');
        StorageFactory.instance = new SupabaseStorage();
      } else if (storageType === 'local') {
        logger.info('[StorageFactory] Initializing LocalStorage');
        StorageFactory.instance = new LocalStorage();
      } else if (storageType === 'gcs') {
        logger.info('[StorageFactory] Initializing GCSStorage');
        StorageFactory.instance = new GCSStorage();
      } else if (storageType === 's3') {
        logger.info('[StorageFactory] Initializing S3Storage', {
          region: process.env.AWS_REGION,
          bucket: process.env.BLOB_STORAGE_BUCKET,
        });
        StorageFactory.instance = new S3Storage({
          region: process.env.AWS_REGION ?? '',
          bucket: process.env.BLOB_STORAGE_BUCKET ?? '',
        });
      } else {
        logger.error('Unsupported storage type', { storageType });
        throw new Error('Unsupported storage type');
      }
      logger.info(`[StorageFactory] Storage backend initialized: ${storageType}`);
    }
    return StorageFactory.instance;
  }
}
