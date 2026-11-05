import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2] ?? process.env.SECRETS_DIR ?? 'deploy/secrets');
mkdirSync(directory, { recursive: true, mode: 0o700 });
for (const name of ['app_db_password', 'migration_db_password', 'mail_key']) {
  try {
    writeFileSync(resolve(directory, name), `${randomBytes(32).toString('hex')}\n`, {
      flag: 'wx',
      // Compose file secrets retain host mode. The private parent directory
      // protects the host copy; mounted files must be readable by UID 65532.
      mode: 0o444,
    });
    console.log(`Created ${name} in ${directory}`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`Kept existing ${name}`);
  }
}
