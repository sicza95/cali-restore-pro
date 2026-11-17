import { expect, test } from '@playwright/test';
import { operations, routeAdmin } from './admin-fixtures';
import { expectTaskLanguage } from './copy-guard';

const labels = {
  en: [
    'Mail job',
    'Email verification',
    'Password reset',
    'New email confirmation',
    'Account security notice',
    'Project invitation',
  ],
  hu: [
    'Levélküldés',
    'E-mail-cím megerősítése',
    'Jelszó visszaállítása',
    'Új e-mail-cím megerősítése',
    'Fiókbiztonsági értesítés',
    'Projektmeghívó',
  ],
};

for (const lang of ['en', 'hu'] as const)
  test(`admin references copy complete ids with localized feedback: ${lang}`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => sessionStorage.setItem('copiedId', text) },
      });
    });
    await routeAdmin(page, 'rows');
    await page.goto('/admin');
    if (lang === 'hu') await page.getByLabel('App language').selectOption('hu');
    await page.locator('[data-control-id="admin.operations.mail"]').click();
    const refs = page.locator('[data-control-id="admin.reference.copy"]');
    const ids = [
      ...operations.jobs.map((job) => job.id),
      ...operations.audit.flatMap((event) => [event.actorId, event.subjectId]),
    ];
    await expect(refs).toHaveCount(ids.length);
    for (const [index, label] of labels[lang].entries()) {
      await expect(refs.nth(index).locator('..').locator('span').first()).toHaveText(label);
    }
    for (const [index, event] of operations.audit.entries()) {
      const expected = [
        event.actorEmail || (lang === 'hu' ? 'Végrehajtó' : 'Actor'),
        event.subjectEmail || (lang === 'hu' ? 'Fiók' : 'Account'),
      ];
      for (const [offset, label] of expected.entries()) {
        await expect(
          refs
            .nth(20 + index * 2 + offset)
            .locator('..')
            .locator('span')
            .first(),
        ).toHaveText(label);
      }
    }
    for (const [index, id] of ids.entries()) {
      await expect(refs.nth(index)).toHaveText(id.slice(0, 8));
      await expect(refs.nth(index)).toHaveAttribute('title', id);
    }
    for (const index of [0, 1, 20, 21, 22, 25]) {
      await refs.nth(index).click();
      expect(await page.evaluate(() => sessionStorage.getItem('copiedId'))).toBe(ids[index]);
      await expect(refs.nth(index).locator('..').getByRole('status')).toHaveText(
        lang === 'hu' ? 'Azonosító másolva.' : 'ID copied.',
      );
    }
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw new Error('Clipboard denied');
      };
    });
    await refs.nth(1).click();
    await expect(refs.nth(1).locator('..').getByRole('status')).toContainText(
      lang === 'hu' ? 'Nem sikerült a másolás.' : 'Could not copy.',
    );
    await expectTaskLanguage(page, `admin copied references ${lang}`);
  });
