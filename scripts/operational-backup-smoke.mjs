import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { compose } from './compose.mjs';

const source = process.env.COMPOSE_PROJECT_NAME;
const target = process.argv[2];
assert.ok(
  source?.startsWith('m07-test-') && target?.startsWith('m07-test-') && source !== target,
  'Use two distinct disposable m07-test-* Compose projects',
);
const staleSession = randomBytes(32).toString('base64url');
const account = 'a0000000-0000-4000-8000-000000000001';
const removed = 'a0000000-0000-4000-8000-000000000002';
const recipient = 'a0000000-0000-4000-8000-000000000003';
const live = 'b0000000-0000-4000-8000-000000000001';
const trash = 'b0000000-0000-4000-8000-000000000002';
const revoked = 'c0000000-0000-4000-8000-000000000001';
const keptFile = 'd0000000-0000-4000-8000-000000000001';
const purgedFile = 'd0000000-0000-4000-8000-000000000002';
const query = (project, input) =>
  compose(
    [
      '-p',
      project,
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
    ],
    { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] },
  ).stdout.trim();
const objects = (project, program, ...args) =>
  compose([
    '-p',
    project,
    'run',
    '--rm',
    '--no-deps',
    '-T',
    '--entrypoint',
    'sh',
    'objects-tool',
    '-ceu',
    program,
    '--',
    ...args,
  ]);
const run = (...args) =>
  spawnSync(process.execPath, ['scripts/operational-backup.mjs', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

query(
  source,
  `INSERT INTO accounts(id,email,password_hash,state) VALUES
 ('${account}','owner@example.test','synthetic','active'),
 ('${removed}','deleted@example.test','synthetic','active'),
 ('${recipient}','recipient@example.test','synthetic','active');
 WITH p AS (INSERT INTO hosted_projects(id,host_id) VALUES ('${live}','${account}'),
 ('${trash}','${account}') RETURNING id,host_id)
 INSERT INTO project_owners SELECT id,host_id FROM p;
 INSERT INTO project_invitations(id,project_id,recipient_id,recipient_email,state)
 VALUES('${revoked}','${live}','${recipient}','recipient@example.test','active');
 INSERT INTO sessions(account_id,token_digest) VALUES ('${recipient}',sha256('${staleSession}'));
 INSERT INTO encrypted_files(id,project_id,source_bytes,manifest_bytes,state)
 VALUES ('${keptFile}','${live}',1,17,'committed'), ('${purgedFile}','${trash}',1,17,'committed');
 INSERT INTO encrypted_parts SELECT id,part,sha256('01234567890123456') FROM encrypted_files CROSS JOIN generate_series(0,1) part;`,
);
objects(
  source,
  'for id; do mkdir -p "/data/objects/encrypted-v1/$id"; for part in 0 1; do printf 01234567890123456 > "/data/objects/encrypted-v1/$id/$part"; done; done',
  keptFile,
  purgedFile,
);
const backup = run('backup');
assert.equal(backup.status, 0, backup.stderr);
const id = backup.stdout.trim().split(/\s+/).at(-1);
assert.match(id, /^[0-9a-f-]{36}$/);
query(
  source,
  `DELETE FROM sessions WHERE account_id='${recipient}';
 UPDATE project_invitations SET state='revoked' WHERE id='${revoked}';
 INSERT INTO project_deletions VALUES ('${trash}',clock_timestamp(),clock_timestamp(),clock_timestamp());
 DELETE FROM hosted_projects WHERE id='${trash}';
 INSERT INTO account_deletions(id,deleted_at,recover_until,purged_at,previous_state)
 VALUES ('${removed}',clock_timestamp(),clock_timestamp(),clock_timestamp(),'active');
 DELETE FROM accounts WHERE id='${removed}';`,
);
// A failed integrity check leaves the target gated and the source available.
query(
  source,
  `UPDATE encrypted_parts SET digest=sha256('corrupted digest') WHERE file_id='${keptFile}' AND part=0;`,
);
const interrupted = target + '-interrupted';
const failed = run('restore', id, interrupted);
assert.notEqual(failed.status, 0, 'Corrupt committed object passed verification');
assert.match(failed.stdout + failed.stderr, /restored objects failed verification/);
assert.equal(query(interrupted, "SELECT current_setting('calirestore.restore_pending');"), 'on');
objects(interrupted, 'test ! -e "/data/objects/encrypted-v1/$1"', purgedFile);
query(
  source,
  `UPDATE encrypted_parts SET digest=sha256('01234567890123456') WHERE file_id='${keptFile}' AND part=0;`,
);

const expired = 'e0000000-0000-4000-8000-000000000001';
query(
  source,
  `INSERT INTO operational_archive_keys VALUES ('${expired}', repeat('0',64), clock_timestamp()-interval '1 second');`,
);
assert.notEqual(run('restore', expired, target + '-expired').status, 0, 'Expired archive restored');
const restore = run('restore', id, target);
assert.equal(restore.status, 0, restore.stderr);
assert.equal(
  query(
    target,
    `SELECT
 (SELECT count(*) FROM hosted_projects),
 (SELECT state FROM project_invitations WHERE id='${revoked}'),
 (SELECT count(*) FROM sessions),
 (SELECT count(*) FROM accounts WHERE id='${removed}'),
 (SELECT count(*) FROM account_deletions WHERE id='${removed}' AND purged_at IS NOT NULL),
 (SELECT count(*) FROM project_deletions WHERE id='${trash}' AND purged_at IS NOT NULL),
 current_setting('calirestore.restore_pending',true) IS DISTINCT FROM 'on';`,
  ),
  '1|revoked|0|0|1|1|t',
);
objects(
  target,
  'test -f "/data/objects/encrypted-v1/$1/0"; test ! -e "/data/objects/encrypted-v1/$2"',
  keptFile,
  purgedFile,
);
assert.equal(query(source, "SELECT current_setting('calirestore.authority_retired');"), 'on');
assert.notEqual(run('restore', id, target + '-retired').status, 0, 'Retired authority restored');
compose(['-p', target, 'up', '-d', '--wait', 'app']);
const origin = 'http://127.0.0.1:' + (process.env.APP_PORT ?? '8080');
assert.equal((await fetch(origin + '/health/ready')).status, 200);
assert.equal(
  (
    await fetch(origin + '/api/v1/auth/me', {
      headers: { cookie: 'calirestore_session=' + staleSession },
    })
  ).status,
  401,
);
console.log(
  'Operational restore retained current revocations, deletion records and surviving object bytes.',
);
