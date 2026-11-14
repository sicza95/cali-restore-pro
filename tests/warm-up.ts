import { chromium, type FullConfig } from '@playwright/test';

/**
 * The Storybook dev server compiles the preview on its first request, which
 * can outlast the 5 s assertion timeout in the first test on each worker.
 * Load one story before the workers start so every test sees a warm server.
 */
export default async function warmUp(config: FullConfig) {
  const { baseURL, channel } = config.projects[0].use;
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto('/iframe.html?id=editor-workspace--landscape&viewMode=story', {
      timeout: 120_000,
    });
    await page.locator('.cr-root').waitFor({ timeout: 120_000 });
  } finally {
    await browser.close();
  }
}
