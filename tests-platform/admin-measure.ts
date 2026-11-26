import type { Page } from '@playwright/test';

export type Box = { left: number; top: number; right: number; bottom: number };
export type AdminGeometry = {
  viewport: { width: number; height: number };
  pageHeight: number;
  scrollWidth: number;
  /** The sheet's content box (inside its padding), in page coordinates. */
  content: Box;
  /** Each part's box and the right edge of its rightmost visible text or control. */
  parts: { name: string; box: Box; inkRight: number }[];
  /** Widest strip of the content box, from top to bottom of the first screen, with no ink. */
  firstScreenGap: number;
  /** Right edge of the rightmost text or control anywhere in the sheet. */
  inkRight: number;
};

/**
 * Measures the admin page. A part is the `.admin-section` holding its heading when it holds
 * only that part, otherwise the vertical band from its heading to the next part's heading
 * (the layout on `main` before #36, where mail, jobs and audit share one section).
 */
export function measureAdmin(page: Page, headings: string[]) {
  return page.evaluate((names): AdminGeometry => {
    const sheet = document.querySelector<HTMLElement>('.account-page')!;
    const style = getComputedStyle(sheet);
    const s = sheet.getBoundingClientRect();
    const y = window.scrollY;
    const box = (r: DOMRect | Box): Box => ({
      left: r.left,
      right: r.right,
      top: r.top + y,
      bottom: r.bottom + y,
    });
    const content = box({
      left: s.left + parseFloat(style.paddingLeft),
      right: s.right - parseFloat(style.paddingRight),
      top: s.top + parseFloat(style.paddingTop),
      bottom: s.bottom - parseFloat(style.paddingBottom),
    });
    const ink: Box[] = [];
    const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const r of range.getClientRects()) if (r.width && r.height) ink.push(box(r));
    }
    for (const el of sheet.querySelectorAll('input, select, button, summary, dd')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) ink.push(box(r));
    }
    const starts = names.map((name) => {
      const el = [...sheet.querySelectorAll<HTMLElement>('h2, summary')].find(
        (h) => h.textContent?.trim() === name,
      );
      if (!el) throw new Error('no heading ' + name);
      return el;
    });
    const parts = starts.map((el, index) => {
      const section = el.closest<HTMLElement>('.admin-section');
      const alone =
        section &&
        starts.filter((other) => other.closest('.admin-section') === section).length === 1;
      let b: Box;
      if (alone) b = box(section.getBoundingClientRect());
      else {
        const top = box(el.getBoundingClientRect()).top;
        const next = starts[index + 1];
        const bottom = next
          ? box(next.getBoundingClientRect()).top
          : box((section ?? sheet).getBoundingClientRect()).bottom;
        b = { left: content.left, right: content.right, top, bottom };
      }
      const inside = ink.filter(
        (r) =>
          r.top >= b.top - 1 &&
          r.bottom <= b.bottom + 1 &&
          r.left >= b.left - 1 &&
          r.right <= b.right + 1,
      );
      return {
        name: names[index],
        box: b,
        inkRight: Math.max(b.left, ...inside.map((r) => r.right)),
      };
    });
    // Columns: project the first screen's ink below the title onto the x axis.
    const title = box(document.querySelector('h1')!.getBoundingClientRect()).bottom;
    const spans = ink
      .filter((r) => r.top >= title && r.top < window.innerHeight + y)
      .map((r) => [Math.max(r.left, content.left), Math.min(r.right, content.right)])
      .sort((a, b) => a[0] - b[0]);
    let gap = 0;
    let reach = content.left;
    for (const [left, right] of spans) {
      gap = Math.max(gap, left - reach);
      reach = Math.max(reach, right);
    }
    gap = Math.max(gap, content.right - reach);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      pageHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      content,
      parts,
      firstScreenGap: Math.round(gap),
      inkRight: Math.max(...ink.map((r) => r.right)),
    };
  }, headings);
}
