// npm audit at high severity, except advisories listed in audit-allowlist.json.
// Each allowlisted advisory needs a tracking issue; remove it once a fix ships.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const blocking = new Set(['high', 'critical']);
const allowlist = JSON.parse(
  readFileSync(new URL('./audit-allowlist.json', import.meta.url), 'utf8'),
);
const allowed = new Set(allowlist.advisories.map((a) => a.id));

// Under `npm run`, npm_execpath points at npm's own CLI, so no shell is needed.
const npmCli = process.env.npm_execpath;
const run = npmCli
  ? spawnSync(process.execPath, [npmCli, 'audit', '--json'], { encoding: 'utf8' })
  : spawnSync('npm', ['audit', '--json'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(run.stderr || run.stdout);
  console.error('npm audit did not return JSON');
  process.exit(1);
}
if (report.error) {
  console.error(report.error.summary ?? report.error);
  process.exit(1);
}

const found = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via !== 'object' || !blocking.has(via.severity)) continue;
    const id = String(via.url ?? '')
      .split('/')
      .pop();
    found.set(id, { name: via.name, title: via.title, severity: via.severity });
  }
}

const failing = [...found].filter(([id]) => !allowed.has(id));
for (const [id, a] of found)
  console.log(
    `${allowed.has(id) ? 'allowed' : 'BLOCKING'} ${a.severity} ${a.name} ${id}: ${a.title}`,
  );
const stale = [...allowed].filter((id) => !found.has(id));
for (const id of stale) console.log(`note: allowlisted ${id} no longer reported; remove it`);

if (failing.length) {
  console.error(`${failing.length} high or critical advisories are not allowlisted`);
  process.exit(1);
}
console.log('audit passed');
