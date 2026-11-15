import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const unknown = '00000000-0000-4000-8000-0000000000aa';

test('the hosted trash names projects this device holds and numbers the rest', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'restorer@example.test',
          state: 'active',
          role: 'member',
        },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('I saved the recovery key').check();
  await page.getByRole('button', { name: 'Set up vault' }).click();
  await page.getByLabel('Project name').fill('East Chapel');
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const known = new URL(page.url()).pathname.split('/').pop()!;
  await page.locator('[data-control-id="project.library"]').click();

  const trash = (entries: string[]) =>
    page.route('**/api/v1/hosted-project-trash', (route) =>
      route.fulfill({
        json: entries.map((id) => ({
          id,
          recoverUntil: '2099-01-30T10:00:00Z',
          backupExpiresAt: '2099-03-01T10:00:00Z',
        })),
      }),
    );
  await trash([unknown, known]);
  await page.locator('[data-control-id="project.trash.open"]').click();
  await page.locator('[data-control-id="project.trash.refresh"]').click();
  const list = page.locator('.project-pane .project-register');
  await expect(list.getByRole('link')).toHaveText(['Deleted project 1', 'East Chapel']);
  await expect(list.getByRole('link', { name: 'East Chapel' })).toHaveAttribute(
    'href',
    '/projects/' + known,
  );
  await expect(page.getByText('Projects that aren’t on this device are numbered.')).toBeVisible();
  await expect(page.locator('[data-control-id="project.trash.restore"]')).toHaveCount(2);
  await expect(page.locator('[data-control-id="project.trash.purge"]')).toHaveCount(2);
  await expect(page.locator('.project-pane')).not.toContainText(unknown);
  await page.screenshot({ path: info.outputPath('project-trash-1194.png'), fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByLabel('App language').selectOption('hu');
  await expect(list.getByRole('link')).toHaveText(['Törölt projekt 1', 'East Chapel']);
  await expect(
    page.getByText('Az ezen az eszközön nem tárolt projektek sorszámot kapnak.'),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('project-trash-hu-1194.png'), fullPage: true });

  await page.unroute('**/api/v1/hosted-project-trash');
  await trash([known]);
  await page.locator('[data-control-id="project.trash.refresh"]').click();
  await expect(list.getByRole('link')).toHaveText(['East Chapel']);
  await expect(page.getByText('Az ezen az eszközön nem tárolt projektek')).toHaveCount(0);
});
