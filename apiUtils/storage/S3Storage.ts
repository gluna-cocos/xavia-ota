import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { StorageInterface } from './StorageInterface';
import { Readable } from 'stream';
import { getLogger } from '../logger';

const logger = getLogger('S3Storage');

export class S3Storage implements StorageInterface {
  private s3: S3Client;
  private bucket: string;

  constructor(options: { region: string; bucket: string }) {
    this.s3 = new S3Client({
      region: options.region,
    });
    this.bucket = options.bucket;
    logger.info(`Initialized for bucket: ${this.bucket} in region: ${options.region}`);
  }

  async uploadFile(path: string, file: Buffer): Promise<string> {
    logger.info(`uploadFile: path=${path}, size=${file.length}`);
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: path,
          Body: file,
        })
      );
      logger.info(`uploadFile: uploaded successfully to ${path}`);
      return path;
    } catch (err) {
      logger.error(`uploadFile ERROR: ${err}`);
      throw err;
    }
  }

  async downloadFile(path: string): Promise<Buffer> {
    logger.info(`downloadFile: path=${path}`);
    try {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: path,
        })
      );
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      logger.info(`downloadFile: downloaded ${buffer.length} bytes from ${path}`);
      return buffer;
    } catch (err) {
      logger.error(`downloadFile ERROR: ${err}`);
      throw err;
    }
  }

  async fileExists(path: string): Promise<boolean> {
    logger.info('fileExists: path=' + path);
    // Si el path termina en '/', lo dejamos, si no, le agregamos '/'
    const prefix = path.endsWith('/') ? path : path + '/';
    const response = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: 1, // Solo necesitamos saber si hay al menos uno
      })
    );
    const exists = !!(response.Contents && response.Contents.length > 0);
    logger.info(`fileExists: ${path} ${exists ? 'exists' : 'does NOT exist'}`);
    return exists;
  }

  async listFiles(directory: string): Promise<
    {
      name: string;
      updated_at: string;
      created_at: string;
      metadata: { size: number; mimetype: string };
    }[]
  > {
    logger.info(`listFiles: directory=${directory}`);
    try {
      const response = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: directory.endsWith('/') ? directory : directory + '/',
          Delimiter: '/',
        })
      );
      if (!response.Contents) {
        logger.info(`listFiles: no files found in ${directory}`);
        return [];
      }
      const files = response.Contents.filter((obj) => obj.Key && obj.Key !== directory + '/').map(
        (obj) => ({
          name: obj.Key!.replace(directory + '/', ''),
          updated_at: obj.LastModified?.toISOString() || '',
          created_at: obj.LastModified?.toISOString() || '',
          metadata: {
            size: obj.Size || 0,
            mimetype: '', // S3 no almacena mimetype por defecto
          },
        })
      );
      logger.info(`listFiles: found ${files.length} files in ${directory}`);
      return files;
    } catch (err) {
      logger.error(`listFiles ERROR: ${err}`);
      throw err;
    }
  }

  async listDirectories(directory: string): Promise<string[]> {
    logger.info(`listDirectories: directory=${directory}`);
    try {
      const response = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: directory.endsWith('/') ? directory : directory + '/',
          Delimiter: '/',
        })
      );
      if (!response.CommonPrefixes) {
        logger.info(`listDirectories: no directories found in ${directory}`);
        return [];
      }
      const cleanDir = directory.endsWith('/') ? directory : directory + '/';
      const dirs = response.CommonPrefixes.map((prefix) =>
        prefix.Prefix!.replace(cleanDir, '').replace(/\/$/, '')
      );
      logger.info(`listDirectories: found ${dirs.length} directories in ${directory}`);
      return dirs;
    } catch (err) {
      logger.error(`listDirectories ERROR: ${err}`);
      throw err;
    }
  }

  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    logger.info(`copyFile: from ${sourcePath} to ${destinationPath}`);
    try {
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${sourcePath}`,
          Key: destinationPath,
        })
      );
      logger.info(`copyFile: copied successfully from ${sourcePath} to ${destinationPath}`);
    } catch (err) {
      logger.error(`copyFile ERROR: ${err}`);
      throw err;
    }
  }
}
