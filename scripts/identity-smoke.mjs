import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compose } from './compose.mjs';

assert.equal(
  process.env.IDENTITY_SMOKE_DISPOSABLE,
  '1',
  'Identity smoke creates synthetic accounts. Run only on an empty disposable Compose project with IDENTITY_SMOKE_DISPOSABLE=1.',
);
const count = compose(
  [
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    'calirestore_migrator',
    '-d',
    'calirestore',
    '-Atc',
    'SELECT count(*) FROM accounts',
  ],
  { encoding: 'utf8', stdio: 'pipe' },
).stdout.trim();
assert.equal(count, '0', 'Refusing identity smoke against a non-empty account database');

const origin = process.env.SMOKE_ORIGIN ?? 'http://localhost:8080';
const trustedOrigin = process.env.APP_ORIGIN ?? 'http://localhost:8080';
assert.notEqual(process.env.APP_ENV, 'production', 'Identity smoke is development-only');
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
assert.match(trustedOrigin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const directory = mkdtempSync(join(tmpdir(), 'calirestore-identity-smoke-'));
chmodSync(directory, 0o700);
const credentialFile = join(directory, 'credential.json');
const credential = {
  email: `synthetic-${randomUUID()}@example.invalid`,
  password: randomBytes(32).toString('base64url'),
};
const bootstrapEnv = { ...process.env, BOOTSTRAP_CREDENTIAL_FILE: credentialFile };
const bootstrap = () =>
  compose(['run', '--rm', '--no-deps', '-T', 'bootstrap'], { env: bootstrapEnv });
const request = async (path, body, cookie, csrf, expected = 200) => {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: trustedOrigin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, expected, path);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { response, data: await response.json() };
};

try {
  writeFileSync(credentialFile, JSON.stringify(credential), { mode: 0o444 });
  bootstrap();
  bootstrap(); // Safe rerun does not reset credentials or create another account.
  const login = await request('/auth/login', credential);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^calirestore_session=/); // Disposable development HTTP only.
  const current = await request('/auth/me', undefined, cookie);
  assert.equal(current.data.account.email, credential.email);
  assert.equal(current.data.account.role, 'superuser');
  assert.ok(current.data.capabilities.includes('roles.manage'));
  const sessions = await request('/auth/sessions', undefined, cookie);
  assert.equal(sessions.data.sessions.length, 1);
  await request(
    '/admin/accounts/' + current.data.account.id + '/policy',
    { role: 'member', state: 'active', confirm: true },
    cookie,
    current.data.csrfToken,
    409,
  );
  const confirmed = await request(
    '/auth/confirm',
    { password: credential.password },
    cookie,
    current.data.csrfToken,
  );
  const rotated = confirmed.response.headers.get('set-cookie').split(';')[0];
  assert.notEqual(rotated, cookie);
  await request('/auth/me', undefined, cookie, undefined, 401);
  await request('/auth/logout', {}, rotated, confirmed.data.csrfToken);
  await request('/auth/me', undefined, rotated, undefined, 401);
} finally {
  chmodSync(credentialFile, 0o600);
  rmSync(credentialFile, { force: true });
  rmdirSync(directory);
}
console.log(
  'Identity smoke passed: mounted one-time bootstrap, login, policy safeguard, confirmation rotation and logout. Synthetic account remains only in the disposable project.',
);
