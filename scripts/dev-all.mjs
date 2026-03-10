import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const loadEnvFile = (filename) => {
  const filePath = path.join(projectRoot, filename);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) return;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnvFile('.env.local');
loadEnvFile('.env');

const relayPort = process.env.LINE_RELAY_PORT || '8787';
const ngrokDomain = (process.env.NGROK_DOMAIN || '').trim();
const shell = process.platform === 'win32';
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const webPort = process.env.VITE_PORT || '5173';
const withMlflow = process.argv.includes('--with-mlflow');

if (!process.env.LINE_PUBLIC_BASE_URL && ngrokDomain) {
  process.env.LINE_PUBLIC_BASE_URL = `https://${ngrokDomain}`;
  console.log(`[dev:all] LINE_PUBLIC_BASE_URL was empty, using https://${ngrokDomain}`);
}

const start = (name, command, args) => {
  console.log(`[dev:all] starting ${name}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell
  });
  child.__name = name;
  return child;
};

const processes = [];
let isShuttingDown = false;

const canListenOnPort = (port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.once('listening', () => {
    server.close(() => resolve(true));
  });
  server.listen(Number(port), '0.0.0.0');
});

const hasNgrokBinary = () => {
  const result = spawnSync('ngrok', ['version'], { stdio: 'ignore', shell });
  return result.status === 0;
};

const hasDockerCompose = () => {
  const result = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore', shell });
  return result.status === 0;
};

const startMlflowContainer = () => {
  console.log('[dev:all] starting mlflow container: docker compose up -d mlflow');
  const result = spawnSync('docker', ['compose', 'up', '-d', 'mlflow'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell
  });
  return result.status === 0;
};

const shutdown = (reason, code = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[dev:all] stopping processes (${reason})...`);

  processes.forEach((child) => {
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  });

  setTimeout(() => process.exit(code), 150);
};

const register = (child) => {
  processes.push(child);

  child.on('error', (error) => {
    if (isShuttingDown) return;
    console.error(`[dev:all] ${child.__name} failed: ${error.message}`);
    if (child.__name === 'ngrok') {
      console.error('[dev:all] install ngrok first: https://ngrok.com/download');
    }
    shutdown(`${child.__name} error`, 1);
  });

  child.on('exit', (exitCode, signal) => {
    if (isShuttingDown) return;
    const code = typeof exitCode === 'number' ? exitCode : 0;
    const why = signal ? `${child.__name} exited with signal ${signal}` : `${child.__name} exited with code ${code}`;
    console.error(`[dev:all] ${why}`);
    shutdown(why, code === 0 ? 1 : code);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const main = async () => {
  const relayPortAvailable = await canListenOnPort(relayPort);
  const webPortAvailable = await canListenOnPort(webPort);
  if (!relayPortAvailable || !webPortAvailable) {
    if (!relayPortAvailable) {
      console.error(`[dev:all] port ${relayPort} is already in use`);
    }
    if (!webPortAvailable) {
      console.error(`[dev:all] port ${webPort} is already in use`);
    }
    console.error('[dev:all] stop old local processes or run `docker compose down` first');
    process.exit(1);
  }

  if (!hasNgrokBinary()) {
    console.error('[dev:all] ngrok is not installed or not in PATH');
    console.error('[dev:all] install ngrok first: https://ngrok.com/download');
    process.exit(1);
  }

  if (withMlflow) {
    if (!hasDockerCompose()) {
      console.error('[dev:all] docker compose is not available');
      process.exit(1);
    }
    if (!startMlflowContainer()) {
      console.error('[dev:all] failed to start mlflow container');
      process.exit(1);
    }

    if (!process.env.MLFLOW_TRACKING_URI || process.env.MLFLOW_TRACKING_URI.includes('://mlflow:')) {
      process.env.MLFLOW_TRACKING_URI = 'http://localhost:5001';
      console.log('[dev:all] MLFLOW_TRACKING_URI set to http://localhost:5001 for local relay');
    }
  }

  register(start('relay', npmBin, ['run', 'dev:relay']));
  register(start('web', npmBin, ['run', 'dev']));

  const ngrokArgs = ngrokDomain
    ? ['http', '--domain', ngrokDomain, relayPort]
    : ['http', relayPort];

  register(start('ngrok', 'ngrok', ngrokArgs));
};

void main();
