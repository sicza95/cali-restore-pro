#!/usr/bin/env node
// Report-only comparison of a desktop Chromium profile (npm run test:perf) against the provisional
// budgets and the recorded baseline (#50, docs/plan/perf-budgets.md).
//
//   node scripts/perf-compare.mjs [--results perf-results/profile.json]
//   node scripts/perf-compare.mjs --record <label> run1.json [run2.json ...]
//
// Exit code: 0 when the comparison ran, even with WARNING lines (the budgets are provisional and
// the CI job is informational). 1 only when an input file is missing or unreadable.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const budgetsPath = option('--budgets', 'perf/budgets.json');
const baselinePath = option('--baseline', 'perf/baseline.json');
const read = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`perf-compare: cannot read ${path}: ${error.message}`);
    process.exit(1);
  }
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

if (args[0] === '--record') {
  const [, label, ...files] = args;
  if (!label || !files.length) {
    console.error('usage: perf-compare.mjs --record <label> run1.json [run2.json ...]');
    process.exit(1);
  }
  const runs = files.map(read);
  const metrics = Object.fromEntries(
    Object.keys(runs[0].metrics).map((key) => [
      key,
      Number(median(runs.map((run) => run.metrics[key])).toFixed(1)),
    ]),
  );
  let baselines = { baselines: [] };
  try {
    baselines = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch {
    // First baseline: start the file.
  }
  const entry = {
    label,
    recordedAt: runs[0].recordedAt.slice(0, 10),
    runs: runs.length,
    environment: runs[0].environment,
    fixture: runs[0].fixture,
    metrics,
    spread: Object.fromEntries(
      Object.keys(metrics).map((key) => {
        const values = runs.map((run) => run.metrics[key]);
        return [key, [Math.min(...values), Math.max(...values)]];
      }),
    ),
  };
  baselines.baselines = [...baselines.baselines.filter((item) => item.label !== label), entry];
  writeFileSync(baselinePath, JSON.stringify(baselines, null, 2) + '\n');
  console.log(`Recorded baseline "${label}" (median of ${runs.length}) in ${baselinePath}.`);
  process.exit(0);
}

const results = read(option('--results', 'perf-results/profile.json'));
const { metrics: budgets } = read(budgetsPath);
let baselines = [];
try {
  baselines = JSON.parse(readFileSync(baselinePath, 'utf8')).baselines;
} catch {
  console.log(`No baseline at ${baselinePath}: only the budgets are checked.`);
}
// Prefer the baseline recorded on the same CPU: a baseline from other hardware is only a guide.
const baseline =
  baselines.find((item) => item.environment.cpuModel === results.environment.cpuModel) ??
  baselines[0];
const sameHardware = baseline?.environment.cpuModel === results.environment.cpuModel;

const lines = [];
const warnings = [];
for (const [key, rule] of Object.entries(budgets)) {
  const value = results.metrics[key];
  if (value === undefined) {
    warnings.push(`${key}: not in the results (the spec and perf/budgets.json disagree)`);
    continue;
  }
  const before = baseline?.metrics[key];
  const delta =
    before === undefined ? '' : `${value - before >= 0 ? '+' : ''}${(value - before).toFixed(1)}`;
  const flags = [];
  if (value > rule.budget) {
    flags.push('OVER BUDGET');
    warnings.push(
      `${key} ${value}${rule.unit} is over the provisional budget of ${rule.budget}${rule.unit}`,
    );
  }
  if (
    sameHardware &&
    before !== undefined &&
    value - before > rule.floor &&
    value > before * (1 + rule.regressionPct / 100)
  ) {
    flags.push('REGRESSION');
    warnings.push(
      `${key} ${value}${rule.unit} is more than ${rule.regressionPct}% above the baseline ${before}${rule.unit}`,
    );
  }
  lines.push({
    key,
    unit: rule.unit,
    value,
    before: before ?? '',
    delta,
    budget: rule.budget,
    status: flags.join(' + ') || 'ok',
  });
}

const pad = (text, width) => String(text).padEnd(width);
const widths = { key: 22, value: 10, before: 10, delta: 9, budget: 8 };
const header = `${pad('metric', widths.key)}${pad('value', widths.value)}${pad('baseline', widths.before)}${pad('delta', widths.delta)}${pad('budget', widths.budget)}status`;
const rows = lines.map(
  (line) =>
    `${pad(line.key + ' (' + line.unit + ')', widths.key)}${pad(line.value, widths.value)}${pad(line.before, widths.before)}${pad(line.delta, widths.delta)}${pad(line.budget, widths.budget)}${line.status}`,
);
const env = results.environment;
const output = [
  `Desktop Chromium profile ${env.chromium} on ${env.platform}, ${env.cpuModel} (${env.ci ? 'CI' : 'local'}), recorded ${results.recordedAt}`,
  baseline
    ? `Baseline "${baseline.label}" (${baseline.recordedAt}, median of ${baseline.runs})${sameHardware ? '' : ': DIFFERENT HARDWARE, regression checks skipped, deltas are a guide only'}`
    : 'No baseline',
  'Budgets are PROVISIONAL desktop numbers (#50); iPad numbers replace them under #49. Report only: nothing here fails the build.',
  '',
  header,
  ...rows,
  '',
  warnings.length
    ? `WARNING: ${warnings.length} item(s) need a look (report only, not a failure):`
    : 'All metrics are within their provisional budgets.',
  ...warnings.map((text) => `  WARNING ${text}`),
];
console.log(output.join('\n'));

if (process.env.GITHUB_ACTIONS) {
  for (const text of warnings)
    console.log(`::warning title=Desktop perf profile (report only)::${text}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + output.join('\n') + '\n```\n');
}
