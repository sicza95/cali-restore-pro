import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { finished, pipeline } from 'node:stream/promises';
import { Transform, Writable } from 'node:stream';
import { compose } from './compose.mjs';

const [action, id, project] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const source = process.env.COMPOSE_PROJECT_NAME ?? 'calirestore';
const sql = [
  'exec',
  '-T',
  'db',
  'psql',
  '-XAt',
  '-v',
  'ON_ERROR_STOP=1',
  '-U',
  'calirestore_migrator',
  '-d',
  'calirestore',
];
const tar = ['run', '--rm', '--no-deps', '-T', 'objects-tool', '-C', '/data/objects/encrypted-v1'];
const query = (prefix, statement) =>
  compose([...prefix, ...sql], {
    input: statement,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  }).stdout.trim();

function child(args, stdio) {
  const process = spawn('docker', ['compose', ...args], { stdio });
  const done = new Promise((resolve, reject) => {
    process.once('error', reject);
    process.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error('Docker Compose child failed')),
    );
  });
  return { process, done };
}

const archiveCommand = (program, archiveId) => [
  'run',
  '--rm',
  '--no-deps',
  '-T',
  'archive-tool',
  '-ceu',
  program,
  '--',
  archiveId,
];

// Stream an IV prefix and an authentication-tag suffix around the ciphertext.
async function* seal(chunks, cipher, iv) {
  yield iv;
  for await (const chunk of chunks) yield cipher.update(chunk);
  yield cipher.final();
  yield cipher.getAuthTag();
}

function decipherArchive(key, archiveId) {
  let decipher;
  let tail = Buffer.alloc(0);
  return new Transform({
    transform(chunk, _encoding, callback) {
      try {
        tail = Buffer.concat([tail, chunk]);
        if (!decipher && tail.length >= 12) {
          decipher = createDecipheriv('aes-256-gcm', key, tail.subarray(0, 12));
          decipher.setAAD(Buffer.from(archiveId));
          tail = tail.subarray(12);
        }
        if (decipher && tail.length > 16) {
          this.push(decipher.update(tail.subarray(0, tail.length - 16)));
          tail = tail.subarray(tail.length - 16);
        }
        callback();
      } catch (error) {
        callback(error);
      }
    },
    flush(callback) {
      try {
        if (!decipher || tail.length !== 16) throw new Error('Incomplete operational archive');
        decipher.setAuthTag(tail);
        callback(null, decipher.final());
      } catch (error) {
        callback(error);
      }
    },
  });
}

async function decrypt(archiveId, key, output) {
  const archive = child(archiveCommand('cat "/data/operational-backups/$1.bin"', archiveId), [
    'ignore',
    'pipe',
    'inherit',
  ]);
  await Promise.all([
    pipeline(archive.process.stdout, decipherArchive(key, archiveId), output),
    archive.done,
  ]);
}

function currentFileIDs() {
  const files = query(
    [],
    `SELECT f.id FROM encrypted_files f LEFT JOIN project_deletions d ON d.id=f.project_id
    WHERE f.state='committed' AND (d.id IS NULL OR d.recover_until>clock_timestamp()) ORDER BY f.id;`,
  );
  if (files && !files.split(/\r?\n/).every((file) => uuid.test(file))) {
    throw new Error('Invalid object IDs');
  }
  return files ? files.replaceAll('\r', '') + '\n' : '';
}

async function backup() {
  const archiveId = randomUUID();
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(archiveId));
  // Register before emitting bytes. The timestamp precedes the object snapshot.
  query(
    [],
    `INSERT INTO operational_archive_keys VALUES ('${archiveId}', '${key.toString('hex')}', clock_timestamp()+interval '1440 hours');`,
  );
  try {
    const files = currentFileIDs();
    compose([
      'run',
      '--rm',
      '--no-deps',
      '-T',
      '--entrypoint',
      'mkdir',
      'objects-tool',
      '-p',
      '/data/objects/encrypted-v1',
    ]);
    const tarProcess = child([...tar, '-cf', '-', '-T', '-'], ['pipe', 'pipe', 'inherit']);
    const archive = child(
      archiveCommand('umask 077; cd /data/operational-backups; cat > "$1.pending"', archiveId),
      ['pipe', 'ignore', 'inherit'],
    );
    tarProcess.process.stdin.end(files);
    await Promise.all([
      pipeline(seal(tarProcess.process.stdout, cipher, iv), archive.process.stdin),
      tarProcess.done,
      archive.done,
      finished(tarProcess.process.stdin),
    ]);
    compose(
      archiveCommand(
        'cd /data/operational-backups; sync "$1.pending"; mv "$1.pending" "$1.bin"; sync .',
        archiveId,
      ),
    );
  } catch (error) {
    query([], `DELETE FROM operational_archive_keys WHERE id='${archiveId}';`);
    throw error;
  }
  console.log(archiveId);
}

function requireFreshTarget(name) {
  for (const volume of [name + '_postgres', name + '_objects']) {
    const result = spawnSync('docker', ['volume', 'inspect', volume], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status === 0 || !result.stderr.includes('no such volume')) {
      throw new Error('Cannot establish restore volume absence');
    }
  }
}

async function restore(archiveId, name) {
  const value = query(
    [],
    `SELECT key_hex FROM operational_archive_keys WHERE id='${archiveId}' AND expires_at>clock_timestamp();`,
  );
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('Operational archive unavailable or expired');
  const key = Buffer.from(value, 'hex');
  await decrypt(
    archiveId,
    key,
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  );
  requireFreshTarget(name);
  const prefix = ['-p', name];
  compose([...prefix, 'up', '-d', '--wait', 'db']);
  query(prefix, "ALTER DATABASE calirestore SET calirestore.restore_pending='on';");
  compose([...prefix, 'create', 'app']);
  compose([
    ...prefix,
    'run',
    '--rm',
    '--no-deps',
    '-T',
    '--entrypoint',
    'mkdir',
    'objects-tool',
    '-p',
    '/data/objects/encrypted-v1',
  ]);
  const files = currentFileIDs();
  if (files) {
    const tool = [
      ...prefix,
      'run',
      '--rm',
      '--no-deps',
      '-T',
      '--entrypoint',
      'sh',
      'objects-tool',
    ];
    compose([...tool, '-ceu', 'umask 077; cat > /data/objects/.restore-files'], {
      input: files,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    try {
      const archive = child(
        [
          ...prefix,
          ...tar,
          '--no-same-owner',
          '--no-same-permissions',
          '--ignore-zeros',
          '-xf',
          '-',
          '-T',
          '/data/objects/.restore-files',
        ],
        ['pipe', 'ignore', 'inherit'],
      );
      await Promise.all([decrypt(archiveId, key, archive.process.stdin), archive.done]);
    } finally {
      compose([...tool, '-ceu', 'rm -f /data/objects/.restore-files']);
    }
  }

  // Clone current authority, never historical accounts, membership, hosting or
  // deletion state. Start with fresh sessions, links and queued mail.
  const dump = child(
    [
      'exec',
      '-T',
      'db',
      'pg_dump',
      '-U',
      'calirestore_migrator',
      '-d',
      'calirestore',
      '--no-owner',
      ...['sessions', 'identity_links', 'mail_outbox', 'operational_archive_keys'].map(
        (table) => '--exclude-table-data=' + table,
      ),
    ],
    ['ignore', 'pipe', 'inherit'],
  );
  const load = child(
    [...prefix, ...sql, '--single-transaction', '-f', '-'],
    ['pipe', 'ignore', 'inherit'],
  );
  await Promise.all([pipeline(dump.process.stdout, load.process.stdin), dump.done, load.done]);
  compose([...prefix, 'run', '--rm', '--no-deps', 'migrate']);
  compose([...prefix, 'run', '--rm', '--no-deps', 'worker', 'verify-restored-objects']);
  if (
    query(
      [],
      `SELECT EXISTS (SELECT 1 FROM operational_archive_keys WHERE id='${archiveId}' AND expires_at>clock_timestamp());`,
    ) !== 't'
  ) {
    throw new Error('Operational archive expired during verification');
  }
  // Fence the previous authority before the target can start. If interrupted
  // between these steps, both sides refuse to serve pending operator review.
  query([], "ALTER DATABASE calirestore SET calirestore.authority_retired='on';");
  query(prefix, 'ALTER DATABASE calirestore RESET calirestore.restore_pending;');
  console.log(`Restored into ${name}. App, worker and tunnel remain stopped.`);
}

if (!(
  (action === 'backup' && !id) ||
  (action === 'restore' &&
    uuid.test(id ?? '') &&
    /^[a-z][a-z0-9-]{2,50}$/.test(project ?? '') &&
    project !== source)
)) {
  throw new Error(
    'Usage: node scripts/operational-backup.mjs backup | restore <archive-id> <fresh-compose-project>',
  );
}

// The lock shares the archive volume across operator processes. An interrupted
// command leaves it in place for explicit recovery instead of allowing overlap.
compose(archiveCommand('mkdir /data/operational-backups/.operation', ''));
try {
  if (
    query(
      [],
      `SELECT coalesce(current_setting('calirestore.authority_retired',true),'')='on'
    OR coalesce(current_setting('calirestore.restore_pending',true),'')='on';`,
    ) !== 'f'
  ) {
    throw new Error('A retired or gated database cannot be used as current authority');
  }

  const running = compose(['ps', '--status', 'running', '--services'], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
    .stdout.trim()
    .split(/\s+/)
    .filter((service) => service === 'app' || service === 'worker');
  let restored = false;
  try {
    if (running.length) compose(['stop', ...running]);
    if (action === 'backup') await backup();
    else {
      await restore(id, project);
      restored = true;
      if (running.includes('worker')) compose(['start', 'worker']);
      console.log('Previous authority fenced. Its worker runs archive retention only.');
    }
  } finally {
    if (!restored && running.length) compose(['start', ...running]);
  }
} finally {
  compose(archiveCommand('rmdir /data/operational-backups/.operation', ''));
}
