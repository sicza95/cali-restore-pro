import { expect, test } from '@playwright/test';
import { chooseLanguage } from './app-navigation';
import { browserControl, createItem, openItem, openProjectSettings } from './project-browser';

for (const language of ['en', 'hu'] as const)
  test(`hosting permission failures explain access and can retry: ${language}`, async ({
    page,
  }) => {
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        json: {
          account: {
            id: '00000000-0000-4000-8000-000000000001',
            email: 'restorer@example.test',
            state: 'active',
            role: 'member',
          },
          csrfToken: 'synthetic-csrf',
        },
      }),
    );
    await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
    await page.route('**/api/v1/hosted-projects', (route) => route.fulfill({ json: [] }));
    let allowed = false;
    let hosted = false;
    await page.route('**/api/v1/hosted-projects/*/invitations', (route) =>
      route.fulfill({
        status: hosted ? 200 : 404,
        json: hosted ? { invitations: [] } : { error: 'not_found' },
      }),
    );
    await page.route(/\/api\/v1\/hosted-projects\/[^/]+$/, (route) => {
      expect(route.request().method()).toBe('PUT');
      expect(route.request().headers()['x-csrf-token']).toBe('synthetic-csrf');
      hosted = allowed;
      return route.fulfill(
        allowed ? { status: 204 } : { status: 403, json: { error: 'not_permitted' } },
      );
    });
    const epoch = '00000000-0000-4000-8000-000000000033';
    await page.route('**/api/v1/hosted-projects/*/revision', (route) => {
      const body = route.request().method() === 'PUT' ? route.request().postDataJSON() : undefined;
      return route.fulfill({
        json: { epoch, head: body ? { ...body, revision: body.expected + 1 } : null },
      });
    });
    await page.route('**/api/v1/hosted-projects/*/owners', (route) =>
      route.fulfill({ json: { owners: [], hostingTransfer: null } }),
    );
    await page.goto('/projects');
    await chooseLanguage(page, language);
    await createItem(page, 'Hosting check');
    await openItem(page, 'Hosting check');
    const settings = await openProjectSettings(page);
    await browserControl(settings, 'project.collaboration').click();
    await browserControl(settings, 'project.host').click();
    const messages = { en: 'Ask an administrator', hu: 'rendszergazdát' };
    await expect(settings.getByRole('alert')).toContainText(messages[language]);
    allowed = true;
    await browserControl(settings, 'project.host').click();
    await expect(browserControl(settings, 'project.host')).toHaveCount(0);
    await expect(settings.getByText(messages[language], { exact: false })).toHaveCount(0);
  });
