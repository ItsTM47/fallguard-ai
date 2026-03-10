import pg from 'pg';
import { relayConfig } from '../api/config/env.mjs';

const { Pool } = pg;

const databaseEnabled = relayConfig.database.enabled && Boolean(relayConfig.database.url);

const pool = databaseEnabled
  ? new Pool({
      connectionString: relayConfig.database.url,
      max: relayConfig.database.poolMax,
      ssl: relayConfig.database.ssl ? { rejectUnauthorized: false } : undefined
    })
  : null;

export const isDatabaseEnabled = () => Boolean(pool);

export const getDatabaseHealthMeta = () => ({
  databaseEnabled,
  databaseConfigured: Boolean(relayConfig.database.url),
  databaseSsl: relayConfig.database.ssl
});

export const query = async (text, params = []) => {
  if (!pool) {
    throw new Error('Database is disabled. Set DATABASE_ENABLED=true and DATABASE_URL.');
  }
  return pool.query(text, params);
};

export const withTransaction = async (callback) => {
  if (!pool) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const closeDatabase = async () => {
  if (!pool) return;
  await pool.end();
};
