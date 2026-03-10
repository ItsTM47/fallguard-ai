import { spawnSync } from 'node:child_process';

const shell = process.platform === 'win32';
const selfPid = process.pid;

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell });
  return result.status === 0;
};

const runSilent = (cmd, args) => {
  spawnSync(cmd, args, { stdio: 'ignore', shell });
};

const collectPidsByPattern = (pattern) => {
  const result = spawnSync('pgrep', ['-f', pattern], { encoding: 'utf8', shell });
  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout
    .split(/\s+/)
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== selfPid);
};

const killPids = (pids) => {
  if (pids.length === 0) return;
  spawnSync('kill', pids.map(String), { stdio: 'ignore', shell });
};

const killPort = (port) => {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', shell });
  if (result.status !== 0 || !result.stdout) return;
  const pids = result.stdout
    .split(/\s+/)
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== selfPid);
  killPids(pids);
};

console.log('[dev:stop] stopping local dev processes...');
killPids(collectPidsByPattern('node scripts/dev-all.mjs'));
killPids(collectPidsByPattern('node backend/api/line-relay.mjs'));
killPids(collectPidsByPattern('vite'));
killPids(collectPidsByPattern('ngrok http'));

// Extra safeguard for common dev ports.
killPort(5173);
killPort(8787);

console.log('[dev:stop] stopping docker compose stack (if running)...');
run('docker', ['compose', 'down']);

console.log('[dev:stop] done');
