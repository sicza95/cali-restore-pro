import { fields, lineKeys, pairKeys, toolFields } from './surface-review-controls';
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
  if (key === 'align' && draft.manualPairs) {
    return (
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

function alignmentOffset(draft: SurfaceDraft | undefined, axis: keyof Point) {
  if (!draft || draft.referenceOnly) return 0;
  const offset = Number(axis === 'x' ? draft.offsetX : draft.offsetY);
  if (!draft.manualPairs) return offset;
  const pairs = pairKeys.map(
    (pair) => Number(draft[pair].end[axis]) - Number(draft[pair].start[axis]),
  );
  return (pairs[0]! + pairs[1]!) / 2 + offset;
}

export function surfacePhotoStyle(
  viewport: { x: number; y: number; zoom: number; rotate: number },
  review?: Partial<Record<ReviewTool, SurfaceDraft>>,
) {
  const preparation = review?.prepare;
  const alignment = review?.align;
  const angle = viewport.rotate + Number(preparation?.rotation ?? 0);
  const tilt = preparation?.rectify ? 0 : (preparation?.perspective ?? 0);
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
      `rotate(${angle}deg)`,
      `perspective(800px) rotateY(${tilt}deg)`,
      `skewX(${preparation?.skew ?? 0}deg) scaleX(${preparation?.flip ? -1 : 1})`,
      `translate(${alignmentOffset(alignment, 'x')}%, ${alignmentOffset(alignment, 'y')}%)`,
    ].join(' '),
    'clip-path': crop && `inset(${crop.join('% ')}%)`,
  };
}
