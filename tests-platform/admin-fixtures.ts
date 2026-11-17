import type { Page } from '@playwright/test';

/** Synthetic administration data shaped like the server's (ids are opaque UUIDs). */
const id = (n: number) =>
  `${n.toString(16).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const operator = {
  id: id(1),
  email: 'operator@example.test',
  state: 'active',
  role: 'superuser',
};

const emails = [
  'member@example.test',
  'conservation.studio.north-wing.restoration-team@regional-heritage-workshop.example.test',
  'aniko.szentgyorgyi-kovacsne@restauratorok.example.test',
  'paint-analysis@example.test',
  'gilding.and.polychrome.surfaces.department@example.test',
  'kovacs.peter@example.test',
  'archive-photography@example.test',
  'plaster-and-stucco-conservation-unit-b@monument-care.example.test',
];
const roles = ['member', 'administrator', 'member', 'member', 'administrator', 'member'];
const states = ['active', 'suspended', 'active', 'pending_verification', 'active', 'active'];

export const accounts = emails.map((email, index) => ({
  id: id(100 + index),
  email,
  role: roles[index % roles.length],
  state: states[index % states.length],
  permissions: index % 3 === 1 ? 5 : 0,
  serverFeatures: index % 2 === 0,
  quotaMiB: index % 2 === 0 ? 2048 : 0,
  sessions: index % 4,
}));

const actions = [
  'policy_changed',
  'sessions_revoked',
  'account_verified',
  'password_changed',
  'email_change_requested',
  'entitlements_changed',
  'delegation_changed',
  'email_changed',
];
const at = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 16, 9, 0) - minutes * 60_000).toISOString();
const mailKinds = ['', 'verify', 'reset', 'email', 'security', 'project-invitation'];

/** The server's limits: 20 mail jobs and 25 audit events. */
export const operations = {
  mail: { pending: 3, sent: 1248, failed: 2 },
  jobs: Array.from({ length: 20 }, (_, n) => ({
    id: id(500 + n),
    kind: mailKinds[n % mailKinds.length],
    status: n < 3 ? 'pending' : n < 5 ? 'failed' : 'sent',
    attempts: n < 5 ? 3 : 1,
    at: at(n * 7),
  })),
  audit: Array.from({ length: 25 }, (_, n) => ({
    actorId: n === 1 ? id(999) : id(1),
    subjectId: n === 2 ? id(998) : id(100 + (n % emails.length)),
    actorEmail: n === 1 ? null : operator.email,
    subjectEmail: n === 2 ? null : emails[n % emails.length],
    action: actions[n % actions.length],
    at: at(n * 11),
  })),
};

export const emptyOperations = { mail: { pending: 0, sent: 0, failed: 0 }, jobs: [], audit: [] };

export const capabilities = [
  'accounts.view',
  'accounts.suspend',
  'accounts.entitlements',
  'roles.manage',
  'accounts.sessions.revoke',
  'operations.view',
];

export type AdminState = 'rows' | 'empty' | 'loading' | 'error';

/** Routes the signed-in superuser and the admin reads for one page state. */
export async function routeAdmin(page: Page, state: AdminState) {
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { account: operator, capabilities, csrfToken: 'fixture' } }),
  );
  const reply = (json: object) => (route: Parameters<Parameters<Page['route']>[1]>[0]) =>
    state === 'loading'
      ? undefined
      : state === 'error'
        ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
        : route.fulfill({ json });
  await page.route(
    '**/api/v1/admin/accounts?**',
    reply(state === 'empty' ? { accounts: [], next: '' } : { accounts, next: id(199) }),
  );
  await page.route(
    '**/api/v1/admin/operations',
    reply(state === 'empty' ? emptyOperations : operations),
  );
}
