import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose } from './compose.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const isolated = process.argv[2] === '--isolated';
const options = { cwd: root, env: { ...process.env } };
if (isolated) {
  options.env.COMPOSE_PROJECT_NAME = 'calirestore-ui-dev';
  options.env.APP_PORT = process.env.APP_PORT ?? '18083';
  options.env.APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${options.env.APP_PORT}`;
  options.env.MAIL_PORT = process.env.MAIL_PORT ?? '18026';
}

try {
  if (process.argv.slice(2).length !== Number(isolated)) {
    throw new Error('Usage: npm run dev:start -- [--isolated]');
  }
  // Check the engine before generating any local files.
  compose(['version'], options);
  const engine = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    ...options,
    stdio: 'inherit',
  });
  if (engine.error) throw engine.error;
  if (engine.status !== 0)
    throw new Error('Start Docker and make its engine available, then retry.');

  const profile = ['--profile', 'dev'];
  const config = JSON.parse(
    compose([...profile, 'config', '--format', 'json'], {
      ...options,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }).stdout,
  );
  const app = config.services.app;
  if (app.environment.APP_ENV !== 'development') {
    throw new Error('Use development settings (APP_ENV=development) with this launcher.');
  }
  const setupScript = fileURLToPath(new URL('./setup-secrets.mjs', import.meta.url));
  const secretsDirectory = dirname(config.secrets.app_db_password.file);
  const setup = spawnSync(process.execPath, [setupScript, secretsDirectory], {
    ...options,
    stdio: 'inherit',
  });
  if (setup.error) throw setup.error;
  if (setup.status !== 0) throw new Error('Local secret setup failed.');
  try {
    compose([...profile, 'up', '--build', '-d', '--wait'], options);
  } catch (error) {
    console.error('Check the Compose startup logs above for the failing service.');
    if (!isolated) {
      console.error('To start with separate local data, run npm run dev:start -- --isolated.');
    }
    throw error;
  }
  const appPort = app.ports.find((port) => port.target === 8080)?.published;
  const mailPort = config.services['mail-sink'].ports.find(
    (port) => port.target === 8025,
  )?.published;
  console.log(`CaliRestore Pro  ${app.environment.APP_ORIGIN}`);
  if (appPort) console.log(`App listener     http://localhost:${appPort}`);
  if (mailPort) console.log(`Local email      http://localhost:${mailPort}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
