import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { projectControls } from '../../src/ui/projects/project-controls';
import { surfaceControls } from '../../src/ui/projects/surface-review-controls';
import { projectTable, revisionQueueTable } from '../../src/platform/vault/store';

/**
 * State the serial projects flow (`projects.browser.ts`) carries from one test to the next. Each
 * step fills in what later steps read.
 */
export interface ProjectsFlow {
  page: Page;
  /** The current session's account id, read by the mocked `auth/me` route. */
  account: string;
  pageErrors: string[];
  /** The brick-pattern photo attached as the main and detail originals. */
  png?: Buffer;
  projectPath?: string;
  surfacePath?: string;
  /** The vault's project and revision queue rows right after the main photo was attached. */
  beforeReview?: unknown[][];
}

export const firstAccount = '00000000-0000-4000-8000-000000000001';
export const otherAccount = '00000000-0000-4000-8000-000000000002';

/** Mocks the session and status routes and collects page errors. */
export async function startFlow(page: Page): Promise<ProjectsFlow> {
  const flow: ProjectsFlow = { page, account: firstAccount, pageErrors: [] };
  page.on('pageerror', (error) => flow.pageErrors.push(error.message));
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: {
          id: flow.account,
          email: 'restorer@example.test',
          state: 'active',
          role: 'member',
        },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  return flow;
}

export function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`An earlier projects flow step did not set ${name}.`);
  return value;
}

/** A project page or library control, checked against the control inventory. */
export const controls = (page: Page, id: string) => {
  expect(projectControls.some((control) => control.id === id)).toBe(true);
  return page.locator(`[data-control-id="${id}"]`);
};

/** A surface review control (`surface.<id>`), checked against the control inventory. */
export const review = (page: Page, id: string) => {
  const key = 'surface.' + id;
  expect(surfaceControls.some((control) => control.id === key)).toBe(true);
  return page.locator('[data-control-id="' + key + '"]');
};

export const attachInput = (page: Page) => page.getByLabel('Original file', { exact: true });

/** A 640 × 480 brick pattern, drawn in the page. */
export async function brickPng(page: Page) {
  return Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#b4afa2';
      context.fillRect(0, 0, 640, 480);
      context.strokeStyle = '#756e60';
      context.lineWidth = 3;
      for (let row = 0; row < 8; row++) {
        context.strokeRect(row % 2 ? -64 : 0, row * 60, 128, 60);
        for (let col = 1; col < 6; col++) {
          context.strokeRect(col * 128 - (row % 2 ? 64 : 0), row * 60, 128, 60);
        }
      }
      return canvas.toDataURL('image/png').split(',')[1]!;
    }),
    'base64',
  );
}

/** Every row of the vault's project and revision queue tables. */
export const revisions = (page: Page) =>
  page.evaluate(
    async (tables) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('calirestore-vault');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction(tables);
        return await Promise.all(
          tables.map(
            (table) =>
              new Promise<unknown[]>((resolve, reject) => {
                const request = tx.objectStore(table).getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              }),
          ),
        );
      } finally {
        db.close();
      }
    },
    [projectTable, revisionQueueTable],
  );
