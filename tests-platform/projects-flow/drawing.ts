import { expect } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { verifyCheckpointReview } from '../checkpoint-review';
import { verifyCanvasZoom } from '../canvas-zoom';
import { drawingControl, verifyDrawingReview } from '../drawing-review';
import { verifyDrawingInput, verifyPointerPath, verifyPointerStroke } from '../drawing-input';
import { attachInput, brickPng, controls, review, revisions } from './flow';
import type { ProjectsFlow } from './flow';

/**
 * Rejects a damaged original, attaches the main photo "wall.png", then runs the drawing input,
 * zoom, pointer, drawing review and checkpoint checks, each of which must write the vault. Starts
 * on the surface page in photo mode with no originals.
 */
export async function attachAndDraw(flow: ProjectsFlow, info: TestInfo) {
  const { page } = flow;
  const attach = attachInput(page);
  const png = (flow.png = await brickPng(page));
  await attach.setInputFiles({
    name: 'damaged.png',
    mimeType: 'image/png',
    buffer: png.subarray(0, 24),
  });
  await controls(page, 'originals.attach').click();
  await expect(page.getByRole('alert')).toContainText('damaged or incomplete');
  await expect(page.locator('.project-originals li')).toHaveText('No originals on this surface.');
  await expect(attach).toHaveValue(/damaged\.png$/);
  await attach.setInputFiles({ name: 'wall.png', mimeType: 'image/png', buffer: png });
  await controls(page, 'originals.attach').click();
  await expect(review(page, 'review.prepare')).toHaveAttribute('aria-disabled', 'false');
  const beforeReview = (flow.beforeReview = await revisions(page));
  expect(beforeReview[0]).toEqual([expect.objectContaining({ revision: expect.any(Number) })]);
  await drawingControl(page, 'mode.drawing').click();
  // The numeric form is a fallback: "Enter by number" starts closed.
  await expect(page.locator('.drawing-workspace details.drawing-details')).not.toHaveAttribute(
    'open',
    '',
  );
  await verifyDrawingInput(page, info);
  await verifyCanvasZoom(page);
  await verifyPointerStroke(page);
  await verifyPointerPath(page);
  await verifyDrawingReview(page, info);
  const afterDrawing = await revisions(page);
  expect(afterDrawing).not.toEqual(beforeReview);
  await verifyCheckpointReview(page, info);
  expect(await revisions(page)).not.toEqual(afterDrawing);
}
