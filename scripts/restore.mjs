import { closeSync, openSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { checksum } from './backup.mjs';
import { compose } from './compose.mjs';

const [, , input, project] = process.argv;
if (
  !input ||
  !project ||
  !/^[a-z][a-z0-9-]{2,50}$/.test(project) ||
  project === (process.env.COMPOSE_PROJECT_NAME ?? 'calirestore')
) {
  throw new Error('Usage: node scripts/restore.mjs <backup-directory> <new-isolated-project-name>');
}
const directory = resolve(input);
const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
assert.equal(manifest.format, 1);
assert.equal(
  manifest.milestone,
  'M-00',
  'Only the M-00 substrate is supported by this restore skeleton',
);
for (const file of ['database.dump', 'objects.tar']) {
  assert.equal(
    await checksum(resolve(directory, file)),
    manifest.files[file],
    `Checksum mismatch: ${file}`,
  );
}
// Existing volumes are never replaced, even if the old containers were removed.
for (const volume of [`${project}_postgres`, `${project}_objects`]) {
  const result = spawnSync('docker', ['volume', 'inspect', volume], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status === 0) throw new Error(`Refusing existing volume ${volume}`);
  if (!result.stderr.includes('no such volume'))
    throw new Error('Cannot establish restore volume absence');
}
const target = (args, options) => compose(['-p', project, ...args], options);
target(['up', '-d', '--wait', 'db']);
// Seed volume ownership from the non-root runtime image without starting it.
target(['create', '--no-deps', 'app']);
const read = (file, args) => {
  const fd = openSync(resolve(directory, file), 'r');
  try {
    target(args, { stdio: [fd, 'inherit', 'inherit'] });
  } finally {
    closeSync(fd);
  }
};
read('database.dump', [
  'exec',
  '-T',
  'db',
  'pg_restore',
  '-U',
  'calirestore_migrator',
  '-d',
  'calirestore',
  '--no-owner',
  '--exit-on-error',
]);
read('objects.tar', [
  'run',
  '--rm',
  '--no-deps',
  '-T',
  'objects-tool',
  '-C',
  '/data/objects',
  '--no-same-owner',
  '--no-same-permissions',
  '-xf',
  '-',
]);
const actual = target(
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
    "SELECT coalesce(json_agg(m ORDER BY version), '[]') FROM (SELECT version,checksum FROM schema_migrations) m",
  ],
  { encoding: 'utf8', stdio: 'pipe' },
);
assert.deepEqual(JSON.parse(actual.stdout), manifest.schema, 'Restored schema history differs');
target(['run', '--rm', '--no-deps', 'migrate']);
console.log(`Restored into ${project}. App, worker and tunnel remain stopped for isolated review.`);
