import { closeSync, mkdirSync, openSync, writeFileSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compose } from './compose.mjs';
import { requireEmptyHosting } from './substrate-backup.mjs';

export async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(process.argv[2] ?? `deploy/backups/${Date.now()}`);
  // Exclusive directory: never overwrite a previous backup.
  mkdirSync(resolve(directory, '..'), { recursive: true, mode: 0o700 });
  mkdirSync(directory, { mode: 0o700 });
  const running = compose(['ps', '--status', 'running', '--services'], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
    .stdout.trim()
    .split(/\s+/);
  if (!running.includes('app') || !running.includes('worker')) {
    throw new Error('Start app and worker before taking a quiesced substrate backup');
  }
  const write = (file, args) => {
    const fd = openSync(resolve(directory, file), 'wx', 0o600);
    try {
      compose(args, { stdio: ['ignore', fd, 'inherit'] });
    } finally {
      closeSync(fd);
    }
  };
  try {
    compose(['stop', 'app', 'worker']);
    requireEmptyHosting(compose);
    write('database.dump', [
      'exec',
      '-T',
      'db',
      'pg_dump',
      '-U',
      'calirestore_migrator',
      '-d',
      'calirestore',
      '--format=custom',
      '--no-owner',
    ]);
    write('objects.tar', [
      'run',
      '--rm',
      '--no-deps',
      '-T',
      'objects-tool',
      '-C',
      '/data/objects',
      '-cf',
      '-',
      '.',
    ]);
    const schema = compose(
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
    ).stdout.trim();
    writeFileSync(
      resolve(directory, 'manifest.json'),
      JSON.stringify(
        {
          format: 1,
          milestone: 'M-00',
          createdAt: new Date().toISOString(),
          schema: JSON.parse(schema),
          files: {
            'database.dump': await checksum(resolve(directory, 'database.dump')),
            'objects.tar': await checksum(resolve(directory, 'objects.tar')),
          },
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  } finally {
    compose(['start', 'app', 'worker']);
  }
  console.log(`Substrate backup saved to ${directory}`);
}
