import formidable from 'formidable';
import fs from 'fs';
import AdmZip from 'adm-zip';
import moment from 'moment';
import { NextApiRequest, NextApiResponse } from 'next';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';
import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { ZipHelper } from '../../apiUtils/helpers/ZipHelper';
import { HashHelper } from '../../apiUtils/helpers/HashHelper';
import { getLogger } from '../../apiUtils/logger';

const logger = getLogger('upload');

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function uploadHandler(req: NextApiRequest, res: NextApiResponse) {
  logger.info('Handler called', { method: req.method });
  if (req.method !== 'POST') {
    logger.info('Method not allowed', { method: req.method });
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const form = formidable({});

  try {
    logger.info('Parsing form data...');
    const [fields, files] = await form.parse(req);
    logger.info('Fields received', { fields });
    logger.info('Files received', { files });
    const file = files.file?.[0];
    const runtimeVersion = fields.runtimeVersion?.[0];
    const version = fields.version?.[0];
    const commitHash = fields.commitHash?.[0];
    const commitMessage = fields.commitMessage?.[0] || 'No message provided';

    if (!file || !runtimeVersion || !commitHash || !version) {
      logger.info('Missing required fields', { file, runtimeVersion, commitHash, version });
      res.status(400).json({ error: 'Missing file, runtime version, version, or commit hash' });
      return;
    }

    const storage = StorageFactory.getStorage();
    const timestamp = moment().utc().format('YYYYMMDDHHmmss');
    const updatePath = `updates/${runtimeVersion}`;

    // Store the zipped file as is
    logger.info('Reading file from disk', { filepath: file.filepath });
    const zipContent = fs.readFileSync(file.filepath);
    const zipFolder = new AdmZip(file.filepath);
    const metadataJsonFile = await ZipHelper.getFileFromZip(zipFolder, 'metadata.json');

    const updateHash = HashHelper.createHash(metadataJsonFile, 'sha256', 'hex');
    const updateId = HashHelper.convertSHA256HashToUUID(updateHash);

    logger.info('Uploading file to storage', { path: `${updatePath}/${timestamp}.zip` });
    const path = await storage.uploadFile(`${updatePath}/${timestamp}.zip`, zipContent);

    logger.info('Creating release in DB...');
    await DatabaseFactory.getDatabase().createRelease({
      path,
      runtimeVersion,
      version,
      timestamp: moment().utc().toString(),
      commitHash,
      commitMessage,
      updateId,
    });
    logger.info('Release created successfully!');

    res.status(200).json({ success: true, path });
  } catch (error) {
    logger.error('Upload error', { error });
    res.status(500).json({ error: 'Upload failed' });
  }
}
