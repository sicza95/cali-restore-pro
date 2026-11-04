import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compose } from './compose.mjs';

const [, , directory, project] = process.argv;
assert.ok(
  directory && project,
  'Usage: node scripts/backup-smoke.mjs <new-backup-directory> <new-restore-project>',
);
const name = `m00-probe-${randomUUID()}`;
const bytes = `synthetic-object-${randomUUID()}`;
const probe = (prefix, args, options) =>
  compose(
    [...prefix, 'run', '--rm', '--no-deps', '-T', '--entrypoint', 'sh', 'objects-tool', ...args],
    options,
  );
const run = (script, ...args) => {
  const result = spawnSync(process.execPath, [`scripts/${script}.mjs`, ...args], {
    stdio: 'inherit',
  });
  assert.equal(result.status, 0, script);
};
try {
  probe([], ['-c', 'umask 077; cat > "/data/objects/$1"', '--', name], {
    input: bytes,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  run('backup', directory);
  run('restore', directory, project);
  const restored = probe(['-p', project], ['-c', 'cat "/data/objects/$1"', '--', name], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert.equal(restored.stdout, bytes, 'Object bytes differ after restore');
  const existing = spawnSync(process.execPath, ['scripts/restore.mjs', directory, project], {
    encoding: 'utf8',
  });
  assert.notEqual(existing.status, 0);
  assert.match(existing.stderr, /Refusing existing volume/);
  const manifestPath = resolve(directory, 'manifest.json');
  const original = readFileSync(manifestPath, 'utf8');
  try {
    const manifest = JSON.parse(original);
    manifest.files['objects.tar'] = '0'.repeat(64);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const corrupt = spawnSync(process.execPath, ['scripts/restore.mjs', directory, project], {
      encoding: 'utf8',
    });
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /Checksum mismatch/);
  } finally {
    writeFileSync(manifestPath, original);
  }
} finally {
  probe([], ['-c', 'rm -f "/data/objects/$1"', '--', name]);
}
console.log(
  'Backup smoke passed: schema/object restore, existing-volume refusal and checksum rejection.',
);
