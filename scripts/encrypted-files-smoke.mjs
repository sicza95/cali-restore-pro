import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID, webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { TextEncoder } from 'node:util';
import { chunkBytes, fileCipher, parseManifest } from '../src/platform/vault/file-format.ts';
import { compose } from './compose.mjs';
import { requireEmptyHosting } from './substrate-backup.mjs';

assert.equal(process.env.IDENTITY_SMOKE_DISPOSABLE, '1', 'Requires a disposable stack');
const origin = new URL(process.env.SMOKE_ORIGIN ?? 'http://localhost:8080');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Loopback only');
const sha = (bytes, encoding = 'hex') => createHash('sha256').update(bytes).digest(encoding);
const owner = randomUUID();
const project = randomUUID();
const id = randomUUID();
const token = randomBytes(32).toString('base64url');
const account = `INSERT INTO accounts(id,email,password_hash,state,server_features,quota_mib)
VALUES ('${owner}','m04-${owner}@example.test','synthetic-only','active',true,80);
INSERT INTO sessions(account_id,token_digest) VALUES ('${owner}',decode('${sha(token)}','hex'));`;
compose(
  [
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    'calirestore_migrator',
    '-d',
    'calirestore',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  { input: account, stdio: ['pipe', 'ignore', 'inherit'] },
);

const base = '/api/v1/hosted-projects/' + project;
const file = base + '/files/' + id;
const headers = {
  // A restart must not reuse a pre-restart HTTP connection.
  Connection: 'close',
  Origin: origin.origin,
  Cookie: 'calirestore_session=' + token,
  'X-CSRF-Token': sha('csrf:' + token, 'base64url'),
};
const timings = [];
async function send(method, path, status, body) {
  const start = performance.now();
  const options = { ...headers };
  if (typeof body === 'string') options['Content-Type'] = 'application/json';
  if (body instanceof ArrayBuffer) {
    options['Content-Type'] = 'application/octet-stream';
    options['X-Ciphertext-SHA256'] = sha(Buffer.from(body));
  }
  const response = await fetch(new URL(path, origin), {
    method,
    headers: options,
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, status, `${method} ${path.slice(path.lastIndexOf('/') + 1)}`);
  const bytes = await response.arrayBuffer();
  if (path.includes('/parts/')) timings.push(performance.now() - start);
  return bytes;
}

const key = await webcrypto.subtle.importKey('raw', randomBytes(32), 'HKDF', false, ['deriveKey']);
const cipher = await fileCipher(key, owner, project, id);
const size = 64 * chunkBytes + 19;
const metadata = { name: 'synthetic-8k-source.dng', type: 'image/x-adobe-dng', size };
const manifest = await cipher.seal(
  0,
  new TextEncoder().encode(JSON.stringify({ v: 1, ...metadata })),
);
const shape = { sourceBytes: size, manifestBytes: manifest.byteLength };
const partPath = (i) => file + '/parts/' + i;
const expected = createHash('sha256');
const uploadStart = performance.now();
await send('PUT', base, 204, '{}');
await send('PUT', file, 200, JSON.stringify(shape));
await send('PUT', partPath(0), 204, manifest);
await send('GET', file, 404);
for (let i = 1; i <= 65; i++) {
  const source = randomBytes(i === 65 ? 19 : chunkBytes);
  expected.update(source);
  await send('PUT', partPath(i), 204, await cipher.seal(i, source));
}
await send('POST', file + '/commit', 204, '{}');
const uploadMs = performance.now() - uploadStart;
assert.throws(() => requireEmptyHosting(compose), /unavailable for hosted projects/);
compose(['restart', 'app', 'worker']);
compose(['up', '-d', '--wait', '--no-build', 'app', 'worker']);
const downloadStart = performance.now();
const storedManifest = await cipher.open(0, await send('GET', partPath(0), 200));
assert.deepEqual(parseManifest(storedManifest, shape), metadata);
const actual = createHash('sha256');
for (let i = 1; i <= 65; i++) {
  actual.update(Buffer.from(await cipher.open(i, await send('GET', partPath(i), 200))));
}
assert.equal(actual.digest('hex'), expected.digest('hex'));
const downloadMs = performance.now() - downloadStart;
timings.sort((a, b) => a - b);
console.log(
  JSON.stringify({
    originalBytes: size,
    uploadMiBPerSecond: +(size / chunkBytes / (uploadMs / 1000)).toFixed(1),
    downloadMiBPerSecond: +(size / chunkBytes / (downloadMs / 1000)).toFixed(1),
    partRoundTripP95Ms: +timings[Math.ceil(timings.length * 0.95) - 1].toFixed(1),
    smokeProcessPeakRSSMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
  }),
);
