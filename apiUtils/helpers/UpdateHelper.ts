import mime from 'mime';

import { HashHelper } from './HashHelper';
import { ZipHelper } from './ZipHelper';
import { StorageFactory } from '../storage/StorageFactory';
import { getLogger } from '../logger';

const logger = getLogger('UpdateHelper');

export class NoUpdateAvailableError extends Error {}
export type GetAssetMetadataArg =
  | {
      updateBundlePath: string;
      filePath: string;
      ext: null;
      isLaunchAsset: true;
      runtimeVersion: string;
      platform: string;
    }
  | {
      updateBundlePath: string;
      filePath: string;
      ext: string;
      isLaunchAsset: false;
      runtimeVersion: string;
      platform: string;
    };

export class UpdateHelper {
  static async getLatestUpdateBundlePathForRuntimeVersionAsync(
    runtimeVersion: string
  ): Promise<string> {
    logger.info('getLatestUpdateBundlePathForRuntimeVersionAsync called', { runtimeVersion });
    const storage = StorageFactory.getStorage();
    const updatesDirectoryForRuntimeVersion = `updates/${runtimeVersion}`;

    const exists = await storage.fileExists(updatesDirectoryForRuntimeVersion);
    logger.info('Checking if updates directory exists', {
      updatesDirectoryForRuntimeVersion,
      exists,
    });
    if (!exists) {
      logger.info('No updates directory found for runtime version', { runtimeVersion });
      throw new NoUpdateAvailableError();
    }

    const zipFiles = (await storage.listFiles(updatesDirectoryForRuntimeVersion))
      .filter((file) => file.name.endsWith('.zip'))
      .sort((a, b) => parseInt(b.name.split('.')[0], 10) - parseInt(a.name.split('.')[0], 10));

    logger.info('Zip files found', {
      count: zipFiles.length,
      zipFiles: zipFiles.map((f) => f.name),
    });

    if (!zipFiles.length) {
      logger.info('No updates found for runtime version', { runtimeVersion });
      throw new Error(`No updates found for runtime version: ${runtimeVersion}`);
    }

    const latestPath = `${updatesDirectoryForRuntimeVersion}/${zipFiles[0].name.replace(
      '.zip',
      ''
    )}`;
    logger.info('Returning latest update bundle path', { latestPath });
    return latestPath;
  }

  static async getAssetMetadataAsync(arg: GetAssetMetadataArg) {
    const zip = await ZipHelper.getZipFromStorage(arg.updateBundlePath);
    const asset = await ZipHelper.getFileFromZip(zip, arg.filePath);

    const assetHash = HashHelper.getBase64URLEncoding(
      HashHelper.createHash(asset, 'sha256', 'base64')
    );
    const key = HashHelper.createHash(asset, 'md5', 'hex');
    const keyExtensionSuffix = arg.isLaunchAsset ? 'bundle' : arg.ext;
    const contentType = arg.isLaunchAsset ? 'application/javascript' : mime.getType(arg.ext);

    return {
      hash: assetHash,
      key,
      fileExtension: `.${keyExtensionSuffix}`,
      contentType,
      url: `${process.env.HOST}/api/assets?asset=${arg.filePath}&runtimeVersion=${arg.runtimeVersion}&platform=${arg.platform}`,
    };
  }

  static async getMetadataAsync({
    updateBundlePath,
    runtimeVersion,
  }: {
    updateBundlePath: string;
    runtimeVersion: string;
  }) {
    try {
      const zip = await ZipHelper.getZipFromStorage(updateBundlePath);
      const metadataBuffer = await ZipHelper.getFileFromZip(zip, 'metadata.json');
      const metadataJson = JSON.parse(metadataBuffer.toString('utf-8'));

      return {
        metadataJson,
        createdAt: new Date().toISOString(),
        id: HashHelper.createHash(metadataBuffer, 'sha256', 'hex'),
      };
    } catch (error) {
      throw new Error(`No metadata found with runtime version: ${runtimeVersion}. Error: ${error}`);
    }
  }

  static async createRollBackDirectiveAsync(updateBundlePath: string) {
    try {
      const zip = await ZipHelper.getZipFromStorage(updateBundlePath);
      const hasRollback = zip.getEntry('rollback') !== null;

      if (hasRollback) {
        return {
          type: 'rollBackToEmbedded',
          parameters: {
            commitTime: new Date().toISOString(),
          },
        };
      }
      throw new Error('No rollback file found');
    } catch (error) {
      throw new Error(`No rollback found. Error: ${error}`);
    }
  }

  static async createNoUpdateAvailableDirectiveAsync() {
    return {
      type: 'noUpdateAvailable',
    };
  }
}
