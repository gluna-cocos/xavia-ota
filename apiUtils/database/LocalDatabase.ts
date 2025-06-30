import { Pool } from 'pg';

import { DatabaseInterface, Release, Tracking, TrackingMetrics } from './DatabaseInterface';
import { Tables } from './DatabaseFactory';
import { getLogger } from '../logger';

export class PostgresDatabase implements DatabaseInterface {
  private pool: Pool;
  private logger = getLogger('PostgresDatabase');

  constructor() {
    this.pool = new Pool({
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    });
    this.logger.info('PostgresDatabase initialized');
  }
  async getLatestReleaseRecordForRuntimeVersion(runtimeVersion: string): Promise<Release | null> {
    this.logger.info('getLatestReleaseRecordForRuntimeVersion called', { runtimeVersion });
    const query = `
      SELECT id, version, runtime_version as "runtimeVersion", path, timestamp, commit_hash as "commitHash"
      FROM ${Tables.RELEASES} WHERE runtime_version = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `;

    const { rows } = await this.pool.query(query, [runtimeVersion]);
    this.logger.info('getLatestReleaseRecordForRuntimeVersion result', { found: !!rows[0] });
    return rows[0] || null;
  }
  async getReleaseByPath(path: string): Promise<Release | null> {
    this.logger.info('getReleaseByPath called', { path });
    const query = `
      SELECT id, version, runtime_version as "runtimeVersion", path, timestamp, commit_hash as "commitHash"
      FROM ${Tables.RELEASES} WHERE path = $1
    `;
    const { rows } = await this.pool.query(query, [path]);
    this.logger.info('getReleaseByPath result', { found: !!rows[0] });
    return rows[0] || null;
  }

  async createTracking(tracking: Omit<Tracking, 'id'>): Promise<Tracking> {
    this.logger.info('createTracking called', { tracking });
    const query = `
      INSERT INTO ${Tables.RELEASES_TRACKING} (release_id, platform)
      VALUES ($1, $2)
      RETURNING id, release_id as "releaseId", download_timestamp as "downloadTimestamp", platform
    `;
    const values = [tracking.releaseId, tracking.platform];
    const { rows } = await this.pool.query(query, values);
    this.logger.info('createTracking result', { id: rows[0]?.id });
    return rows[0];
  }

  async getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]> {
    this.logger.info('getReleaseTrackingMetrics called', { releaseId });
    const query = `
      SELECT platform, COUNT(*) as count
      FROM ${Tables.RELEASES_TRACKING}
      WHERE release_id = $1
      GROUP BY platform
    `;
    const { rows } = await this.pool.query(query, [releaseId]);
    this.logger.info('getReleaseTrackingMetrics result', { count: rows.length });
    return rows.map((row) => ({
      platform: row.platform,
      count: Number(row.count),
    }));
  }

  async getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]> {
    this.logger.info('getReleaseTrackingMetricsForAllReleases called');
    const query = `
      SELECT platform, COUNT(*) as count
      FROM ${Tables.RELEASES_TRACKING}
      GROUP BY platform
    `;
    const { rows } = await this.pool.query(query);
    this.logger.info('getReleaseTrackingMetricsForAllReleases result', { count: rows.length });
    return rows.map((row) => ({
      platform: row.platform,
      count: Number(row.count),
    }));
  }

  async createRelease(release: Omit<Release, 'id'>): Promise<Release> {
    this.logger.info('createRelease called', { release });
    const query = `
      INSERT INTO ${Tables.RELEASES} (version, runtime_version, path, timestamp, commit_hash, commit_message, update_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, version, runtime_version as "runtimeVersion", path, timestamp, commit_hash as "commitHash", update_id as "updateId"
    `;

    const values = [
      release.version,
      release.runtimeVersion,
      release.path,
      release.timestamp,
      release.commitHash,
      release.commitMessage,
      release.updateId,
    ];
    const { rows } = await this.pool.query(query, values);
    this.logger.info('createRelease result', { id: rows[0]?.id });
    return rows[0];
  }

  async getRelease(id: string): Promise<Release | null> {
    this.logger.info('getRelease called', { id });
    const query = `
      SELECT id, version, runtime_version as "runtimeVersion", path, timestamp, commit_hash as "commitHash"
      FROM ${Tables.RELEASES} WHERE id = $1
    `;

    const { rows } = await this.pool.query(query, [id]);
    this.logger.info('getRelease result', { found: !!rows[0] });
    return rows[0] || null;
  }

  async listReleases(): Promise<Release[]> {
    this.logger.info('listReleases called');
    const query = `
      SELECT id, version, runtime_version as "runtimeVersion", path, timestamp, commit_hash as "commitHash", commit_message as "commitMessage"
      FROM ${Tables.RELEASES}
      ORDER BY timestamp DESC
    `;

    const { rows } = await this.pool.query(query);
    this.logger.info('listReleases result', { count: rows.length });
    return rows;
  }
}
