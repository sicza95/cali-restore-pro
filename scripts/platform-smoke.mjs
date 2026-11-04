import assert from 'node:assert/strict';
import { compose } from './compose.mjs';

const origin = process.env.SMOKE_ORIGIN ?? 'http://127.0.0.1:8080';
async function response(path, status = 200) {
  const result = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(4000) });
  assert.equal(result.status, status, path);
  return result;
}
async function waitReady() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await response('/health/ready');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Readiness did not recover');
}

await waitReady();
assert.equal((await response('/api/v1/status')).headers.get('cache-control'), 'no-store');
assert.match(await (await response('/')).text(), /CaliRestore Pro/);
await response('/api/v1/unimplemented', 404);
await response('/assets/missing.js', 404);
compose(['exec', '-T', 'worker', '/app/calirestore', 'worker-healthcheck']);
compose(['run', '--rm', 'migrate']);
compose(['run', '--rm', 'migrate']);
// Service code runs non-root, without a shell, with its root filesystem read-only.
const info = compose(['ps', '-q', 'app'], { encoding: 'utf8', stdio: 'pipe' }).stdout.trim();
const { spawnSync } = await import('node:child_process');
const inspect = spawnSync('docker', ['inspect', info], { encoding: 'utf8' });
assert.equal(inspect.status, 0);
const [container] = JSON.parse(inspect.stdout);
assert.equal(container.Config.User, '65532:65532');
assert.equal(container.HostConfig.ReadonlyRootfs, true);
try {
  compose(['stop', 'db']);
  await response('/health/live');
  const unavailable = await response('/health/ready', 503);
  assert.deepEqual(await unavailable.json(), { status: 'unavailable', milestone: 'M-00' });
  await response('/api/v1/status', 503);
  await new Promise((resolve) => setTimeout(resolve, 7000));
  const worker = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'worker', '/app/calirestore', 'worker-healthcheck'],
    { stdio: 'pipe' },
  );
  assert.notEqual(worker.status, 0, 'worker remained ready after database loss');
} finally {
  compose(['start', 'db']);
}
await waitReady();
compose(['restart', 'app', 'worker']);
await waitReady();
console.log(
  'Platform smoke passed: migrations, role/runtime boundaries, dependency loss and restart.',
);
