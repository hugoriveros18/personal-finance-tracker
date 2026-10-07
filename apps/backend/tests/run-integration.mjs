import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

const require = createRequire(import.meta.url);
const server = createServer();
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const { port } = server.address();
await new Promise((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve())),
);
const directory = await mkdtemp(join(tmpdir(), 'pft-integration-'));
const databaseUrl = `postgresql://pft:pft-test-only@127.0.0.1:${port}/pft_test`;
const database = new EmbeddedPostgres({
  databaseDir: join(directory, 'postgres'),
  user: 'pft',
  password: 'pft-test-only',
  port,
  persistent: false,
  postgresFlags: ['-h', '127.0.0.1', '-k', directory],
  onLog: () => {},
  onError: () => {},
});
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  JWT_ACCESS_SECRET: 'integration-access-secret-only',
  JWT_REFRESH_SECRET: 'integration-refresh-secret-only',
  SINGLE_USER_MODE: 'false',
  UPLOAD_DIR: join(directory, 'uploads'),
  COOKIE_SECURE: 'false',
  PFT_INTEGRATION_RUN: '1',
};
function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${signal ?? code}): ${args.join(' ')}`));
    });
  });
}
let started = false;
try {
  await mkdir(join(env.UPLOAD_DIR, 'avatars'), { recursive: true });
  await database.initialise();
  await database.start();
  started = true;
  await database.createDatabase('pft_test');
  await run(require.resolve('prisma/build/index.js'), ['migrate', 'deploy']);
  await run(require.resolve('prisma/build/index.js'), [
    'migrate',
    'diff',
    '--from-url',
    databaseUrl,
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--exit-code',
  ]);
  await run(require.resolve('vitest/vitest.mjs'), [
    'run',
    '--config',
    'vitest.integration.config.ts',
    ...process.argv.slice(2),
  ]);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (started) await database.stop();
  await rm(directory, { recursive: true, force: true });
}
