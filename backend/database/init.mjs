import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabaseHealthMeta, isDatabaseEnabled, withDatabaseClient } from './connection.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, 'schema.sql');
const SCHEMA_MIGRATION_LOCK_KEY = 1703202601;

const initState = {
  databaseInitialized: false,
  databaseInitError: ''
};

export const initializeDatabase = async () => {
  if (!isDatabaseEnabled()) {
    initState.databaseInitialized = false;
    initState.databaseInitError = '';
    return {
      ...getDatabaseHealthMeta(),
      ...initState
    };
  }

  try {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await withDatabaseClient(async (client) => {
      await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_MIGRATION_LOCK_KEY]);
      try {
        await client.query(schemaSql);
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_MIGRATION_LOCK_KEY]);
      }
    });
    initState.databaseInitialized = true;
    initState.databaseInitError = '';
  } catch (error) {
    initState.databaseInitialized = false;
    initState.databaseInitError = error.message || 'unknown error';
  }

  return {
    ...getDatabaseHealthMeta(),
    ...initState
  };
};

export const getDatabaseInitMeta = () => ({ ...initState });
