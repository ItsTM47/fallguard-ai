import { startRelayServer } from './server.mjs';

try {
  await startRelayServer();
} catch (error) {
  console.error(`Relay startup failed: ${error.message || 'unknown error'}`);
  process.exit(1);
}
