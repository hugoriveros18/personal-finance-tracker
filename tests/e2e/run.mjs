import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
const [dbPort, apiPort, webPort] = await Promise.all([freePort(), freePort(), freePort()]);
const directory = await mkdtemp(join(tmpdir(), 'pft-browser-db-'));
const artifacts = join(root, 'test-results', 'e2e-server');
await mkdir(artifacts, { recursive: true });
await mkdir(join(directory, 'uploads', 'avatars'), { recursive: true });
const database = new EmbeddedPostgres({
  databaseDir: join(directory, 'postgres'),
  user: 'pft',
  password: 'pft-test-only',
  port: dbPort,
  persistent: false,
  postgresFlags: ['-h', '127.0.0.1', '-k', directory],
  onLog: () => {},
  onError: () => {},
});
const web = `http://127.0.0.1:${webPort}`;
const env = {
  ...process.env,
  PFT_E2E_BASE_URL: web,
  PFT_E2E_RUN: '1',
  NODE_ENV: 'test',
  DATABASE_URL: `postgresql://pft:pft-test-only@127.0.0.1:${dbPort}/pft_test`,
  JWT_ACCESS_SECRET: 'browser-test-access-secret',
  JWT_REFRESH_SECRET: 'browser-test-refresh-secret',
  SINGLE_USER_MODE: 'false',
  COOKIE_SECURE: 'false',
  UPLOAD_DIR: join(directory, 'uploads'),
  CORS_ORIGIN: web,
  PORT: String(apiPort),
  VITE_API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
};
const children = [];
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    interrupted = true;
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    }
  });
}
function start(file, args, cwd = root) {
  const child = spawn(process.execPath, [file, ...args], {
    env,
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let logs = '';
  child.stdout.on('data', (x) => (logs += x));
  child.stderr.on('data', (x) => (logs += x));
  child.logs = () => logs;
  child.on('error', (error) => (logs += `${error.message}\n`));
  return child;
}
async function command(file, args, cwd = root) {
  const child = start(file, args, cwd);
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      process.stdout.write(child.logs());
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code}): ${args.join(' ')}`));
    });
  });
}
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    if (interrupted) throw new Error('E2E run interrupted');
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      // Retry until the server is ready or the startup deadline expires.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server unavailable: ${url}`);
}

let started = false;
try {
  await database.initialise();
  await database.start();
  started = true;
  await database.createDatabase('pft_test');
  await command(
    join(root, 'node_modules/prisma/build/index.js'),
    ['migrate', 'deploy'],
    join(root, 'apps/backend'),
  );
  start(join(root, 'node_modules/tsx/dist/cli.mjs'), ['src/server.ts'], join(root, 'apps/backend'));
  start(
    join(root, 'node_modules/vite/bin/vite.js'),
    ['--host', '127.0.0.1', '--port', String(webPort), '--strictPort'],
    join(root, 'apps/frontend'),
  );
  await ready(`http://127.0.0.1:${apiPort}/api/v1/health`);
  await ready(web);
  await command(join(root, 'node_modules/@playwright/test/cli.js'), [
    'test',
    ...process.argv.slice(2),
  ]);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const [index, child] of children.entries()) {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        child.kill('SIGTERM');
      });
    }
    await writeFile(join(artifacts, `process-${index}.log`), child.logs());
  }
  if (started) await database.stop();
  await rm(directory, { recursive: true, force: true });
}
