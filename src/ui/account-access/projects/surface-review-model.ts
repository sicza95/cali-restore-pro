import type { Matrix } from '../../../platform/projects/planar-types';
import { fields, lineKeys, toolFields } from './surface-review-controls';
import type { ReviewTool } from './surface-review-controls';

export const nudge = {
  left: [-24, 0],
  right: [24, 0],
  up: [0, -24],
  down: [0, 24],
} as const;
export type Point = { x: string; y: string };
type Segment = { start: Point; end: Point };
const point = (x: number, y: number): Point => ({ x: String(x), y: String(y) });

export const defaults = (unit: string) => ({
  cropX: '0',
  cropY: '0',
  cropWidth: '100',
  cropHeight: '100',
  rotation: '0',
  skew: '0',
  perspective: '0',
  offsetX: '0',
  offsetY: '0',
  usable: '100',
  width: '',
  height: '',
  flip: false,
  rectify: false,
  aspect: 'free',
  method: 'dimensions',
  referenceOnly: false,
  manualPairs: false,
  pairOne: { start: point(30, 30), end: point(30, 30) },
  pairTwo: { start: point(70, 70), end: point(70, 70) },
  horizontal: { start: point(20, 50), end: point(80, 50) },
  vertical: { start: point(50, 20), end: point(50, 80) },
  unit,
});

export type SurfaceDraft = ReturnType<typeof defaults>;

const coordinate = (value: string) => !!value.trim() && Number(value) >= 0 && Number(value) <= 100;
const validPoint = (p: Point) => coordinate(p.x) && coordinate(p.y);
const distinct = (a: Point, b: Point) => Number(a.x) !== Number(b.x) || Number(a.y) !== Number(b.y);
const validSegment = (s: Segment) => validPoint(s.start) && validPoint(s.end);

export function validateDraft(
  key: ReviewTool,
  draft: SurfaceDraft,
  size?: { width: number; height: number },
) {
  if (key === 'align' && draft.referenceOnly) return true;
  if (
    !toolFields[key].every((field) => {
      const [min, max] = fields[field];
      const value = draft[field];
      return !!value.trim() && Number(value) >= min && Number(value) <= max;
    })
  )
    return false;
  if (key === 'prepare') {
    return (
      Number(draft.cropX) + Number(draft.cropWidth) <= 100 &&
      Number(draft.cropY) + Number(draft.cropHeight) <= 100 &&
      (draft.aspect !== 'square' ||
        !size ||
        Math.abs(Number(draft.cropWidth) * size.width - Number(draft.cropHeight) * size.height) <=
          100)
    );
  }
  if (key === 'align') {
    return (
      draft.manualPairs &&
      validSegment(draft.pairOne) &&
      validSegment(draft.pairTwo) &&
      distinct(draft.pairOne.start, draft.pairTwo.start) &&
      distinct(draft.pairOne.end, draft.pairTwo.end)
    );
  }
  return (
    key !== 'calibrate' ||
    draft.method !== 'lines' ||
    lineKeys.every(
      (line) => validSegment(draft[line]) && distinct(draft[line].start, draft[line].end),
    )
  );
}

export function photoMatrixStyle([a, b, c, d, e, f, g, h, i]: Matrix, sx: number, sy: number) {
  return (
    'matrix3d(' +
    [
      a,
      (d * sy) / sx,
      0,
      g / sx,
      (b * sx) / sy,
      e,
      0,
      h / sy,
      0,
      0,
      1,
      0,
      c * sx,
      f * sy,
      0,
      i,
    ].join(',') +
    ')'
  );
}

export function surfacePhotoStyle(
  viewport: { x: number; y: number; zoom: number; rotate: number },
  preparation?: SurfaceDraft,
) {
  const crop = preparation
    ? [
        preparation.cropY,
        100 - Number(preparation.cropX) - Number(preparation.cropWidth),
        100 - Number(preparation.cropY) - Number(preparation.cropHeight),
        preparation.cropX,
      ]
    : undefined;
  return {
    transform: [
      `translate(${viewport.x}px, ${viewport.y}px)`,
      `scale(${viewport.zoom / 100})`,
      `rotate(${viewport.rotate}deg)`,
    ].join(' '),
    'clip-path': crop && `inset(${crop.join('% ')}%)`,
  };
}
