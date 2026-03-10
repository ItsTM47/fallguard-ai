import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabaseHealthMeta, isDatabaseEnabled, query } from './connection.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, 'schema.sql');

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
    await query(schemaSql);
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
