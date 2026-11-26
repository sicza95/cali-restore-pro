import { chromium, type FullConfig } from '@playwright/test';

/**
 * The Storybook dev server compiles each story's module graph on first
 * request (Solid's Babel transform, cold: ~5 s for the project browser, 6-8 s
 * for other feature groups), which can outlast the 5 s assertion timeout in
 * whichever test touches a group first. Load one story per title before the
 * workers start so every test sees a warm server.
 */
export default async function warmUp(config: FullConfig) {
  const { baseURL, channel } = config.projects[0].use;
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage({ baseURL });
    const response = await page.request.get('/index.json', { timeout: 120_000 });
    const index = (await response.json()) as {
      entries: Record<string, { id: string; title: string; type: string }>;
    };
    const firstPerTitle = new Map<string, string>();
    for (const entry of Object.values(index.entries)) {
      if (entry.type === 'story' && !firstPerTitle.has(entry.title)) {
        firstPerTitle.set(entry.title, entry.id);
      }
    }
    for (const id of firstPerTitle.values()) {
      await page.goto(`/iframe.html?id=${id}&viewMode=story`, { timeout: 120_000 });
      await page.locator('.cr-root').waitFor({ timeout: 120_000 });
    }
  } finally {
    await browser.close();
  }
}
