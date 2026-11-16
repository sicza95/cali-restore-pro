import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Synthetic accounts for invitations.spec.ts: an owner and a recipient with hosting and a 1 MiB
// quota, and a second recipient with neither, each with a fresh session. The tokens live only in
// this process's environment, which Playwright passes on to its workers. The spec leaves
// invitations and hosted projects behind, so each run needs a fresh stack.
const accounts = [
  ['M06_OWNER_SESSION', 'owner@example.test', true, 1],
  ['M06_RECIPIENT_SESSION', 'recipient@example.test', true, 1],
  ['M06_REMAINING_SESSION', 'remaining@example.test', false, 0],
] as const;

/** Seeds the M06 sessions on a disposable development Compose project (`IDENTITY_SMOKE_DISPOSABLE=1`). */
export default function seedM06Sessions() {
  if (process.env.IDENTITY_SMOKE_DISPOSABLE !== '1') return;
  if (accounts.every(([name]) => process.env[name])) return;
  if (process.env.APP_ENV === 'production') throw new Error('M06 seeding is development-only');
  const sessions: Record<string, string> = {};
  let sql = 'BEGIN;\n';
  for (const [name, email, hosting, quota] of accounts) {
    const token = randomBytes(32).toString('base64url');
    const digest = createHash('sha256').update(token).digest('hex');
    sql += `WITH account AS (
  INSERT INTO accounts (email, password_hash, state, server_features, quota_mib)
  VALUES ('${email}', 'synthetic-only', 'active', ${hosting}, ${quota})
  RETURNING id
)
INSERT INTO sessions (account_id, token_digest) SELECT id, decode('${digest}', 'hex') FROM account;
`;
    sessions[name] = token;
  }
  sql += 'COMMIT;\n';
  const psql = ['exec', '-T', 'db', 'psql', '-U', 'calirestore_migrator', '-d', 'calirestore'];
  const result = spawnSync('docker', ['compose', ...psql, '-q', '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error('M06 seeding failed; the accounts may exist already: use a fresh stack');
  Object.assign(process.env, sessions);
}
