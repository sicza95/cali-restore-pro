import { spawnSync } from 'node:child_process';

export function compose(args, options = {}) {
  const result = spawnSync('docker', ['compose', ...args], {
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker compose ${args[0]} failed (${result.status})`);
  return result;
}
