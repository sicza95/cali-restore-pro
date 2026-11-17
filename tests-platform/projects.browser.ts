import { expect, test } from '@playwright/test';
import * as recovery from './recovery-conflict';
import { startFlow, required } from './projects-flow/flow';
import type { ProjectsFlow } from './projects-flow/flow';
import { createProjectHierarchy } from './projects-flow/hierarchy';
import { attachAndDraw } from './projects-flow/drawing';
import { reviewPhotos } from './projects-flow/photo';
import { draftAndAttachReference, reopenSurface } from './projects-flow/reopen';
import { archiveAndRestore, verifyUnavailable } from './projects-flow/access';

// One project, one page and one vault for the whole flow: each test continues where the previous
// one stopped, so they run in order and a failure skips the rest (#44). Each test sets its own
// timeout here, at least four times its local run time (#44: 0.4 to 17 s, about 47 s in all).
test.describe.configure({ mode: 'serial' });

test.describe('project hierarchy and encrypted originals reopen from the local vault', () => {
  // Touch and pen input go through CDP (drawing-input.ts, drawing-review.ts, photo-gestures.ts),
  // which only Chromium has, and every later step builds on the drawing step (#51).
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Drawing input needs CDP touch and pen events (Chromium only)',
  );
  let flow: ProjectsFlow;

  test.beforeAll(async ({ browser }, info) => {
    const context = await browser.newContext({ baseURL: info.project.use.baseURL, hasTouch: true });
    flow = await startFlow(await context.newPage());
  });

  test.afterEach(() => {
    expect(flow.pageErrors).toEqual([]);
  });

  test.afterAll(async () => {
    await flow?.page.context().close();
  });

  test('a project with an object and a surface', async () => {
    test.setTimeout(30_000);
    await createProjectHierarchy(flow, test.info());
  });

  test('originals attach, drawing review and checkpoints', async () => {
    test.setTimeout(60_000);
    await attachAndDraw(flow, test.info());
  });

  test('photo preparation, calibration and detail alignment', async () => {
    test.setTimeout(30_000);
    await reviewPhotos(flow, test.info());
  });

  test('drafts are kept when a reference photo is attached', async () => {
    test.setTimeout(30_000);
    await draftAndAttachReference(flow, test.info());
  });

  test('the surface reopens with its drafts and preparation', async () => {
    test.setTimeout(30_000);
    await reopenSurface(flow, test.info());
  });

  test('photo removal and recovery conflict with drafts pending', async () => {
    test.setTimeout(60_000);
    await recovery.verifyRemovalKeepsDrafts(flow.page, required(flow.surfacePath, 'surfacePath'));
    await recovery.verifyRecoveryConflict(flow.page, test.info());
  });

  test('draft source, reference change and blocked originals', async () => {
    test.setTimeout(90_000);
    await recovery.verifyDraftSourceBlocked(flow.page, test.info());
  });

  test('archive and restore', async () => {
    test.setTimeout(30_000);
    await archiveAndRestore(flow, test.info());
  });

  test('unavailable surfaces, other accounts and signed-out sessions', async () => {
    test.setTimeout(30_000);
    await verifyUnavailable(flow);
  });
});
