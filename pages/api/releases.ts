import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';
import { getLogger } from '../../apiUtils/logger';

const logger = getLogger('releases');

export default async function releasesHandler(req: NextApiRequest, res: NextApiResponse) {
  logger.info('Handler called', { method: req.method });
  if (req.method !== 'GET') {
    logger.info('Method not allowed', { method: req.method });
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const storage = StorageFactory.getStorage();
    logger.info('Fetching release directories...');
    const directories = await storage.listDirectories('updates/');
    logger.info('Found directories', { count: directories.length, directories });

    logger.info('Fetching releases with commit hash from DB...');
    const releasesWithCommitHash = await DatabaseFactory.getDatabase().listReleases();

    const releases = [];
    let totalFiles = 0;
    for (const directory of directories) {
      const folderPath = `updates/${directory}`;
      const files = await storage.listFiles(folderPath);
      const runtimeVersion = directory;
      totalFiles += files.length;

      for (const file of files) {
        const release = releasesWithCommitHash.find((r) => r.path === `${folderPath}/${file.name}`);
        const commitHash = release ? release.commitHash : null;
        releases.push({
          path: release?.path || `${folderPath}/${file.name}`,
          version: release?.version,
          runtimeVersion,
          timestamp: file.created_at,
          size: file.metadata.size,
          commitHash,
          commitMessage: release?.commitMessage,
        });
      }
    }
    logger.info('Releases processed', {
      totalDirectories: directories.length,
      totalFiles,
      totalReleases: releases.length,
    });
    res.status(200).json({ releases });
  } catch (error) {
    logger.error('Failed to fetch releases', { error });
    res.status(500).json({ error: 'Failed to fetch releases' });
  }
}
