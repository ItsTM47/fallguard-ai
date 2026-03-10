import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDatabaseEnabled, withDatabaseClient, closeDatabase } from './connection.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, 'schema.sql');
const SCHEMA_MIGRATION_LOCK_KEY = 1703202601;

const run = async () => {
  if (!isDatabaseEnabled()) {
    console.error('[db:migrate] database is disabled or DATABASE_URL is missing');
    process.exitCode = 1;
    return;
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await withDatabaseClient(async (client) => {
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_MIGRATION_LOCK_KEY]);
    try {
      await client.query(schemaSql);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_MIGRATION_LOCK_KEY]);
    }
  });
  console.log('[db:migrate] schema applied successfully');
};

try {
  await run();
} catch (error) {
  console.error(`[db:migrate] failed: ${error.message || 'unknown error'}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
