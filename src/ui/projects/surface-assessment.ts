import {
  acceptDetail,
  calibrate,
  newPlanarSurface,
  preparePhoto,
  sameSource,
} from '../../../platform/projects/planar-state';
import type {
  AlignmentInput,
  CalibrationInput,
  LengthUnit,
  PlanarSurface,
  Point as Pixel,
  Preparation,
  SourceFrame,
} from '../../../platform/projects/planar-types';
import { lineKeys, pairKeys } from './surface-review-controls';
import type { ReviewTool } from './surface-review-controls';
import { defaults } from './surface-review-model';
import type { Point, SurfaceDraft } from './surface-review-model';

const pixel = (source: SourceFrame, p: Point): Pixel => [
  (Number(p.x) * source.width) / 100,
  (Number(p.y) * source.height) / 100,
];
const percent = (source: SourceFrame, p: Pixel): Point => ({
  x: String((p[0] / source.width) * 100),
  y: String((p[1] / source.height) * 100),
});
const lengths = (draft: SurfaceDraft) => ({
  width: Number(draft.width),
  height: Number(draft.height),
  unit: draft.unit as LengthUnit,
});

export function preparation(source: SourceFrame, draft: SurfaceDraft): Preparation {
  const [x, y] = pixel(source, { x: draft.cropX, y: draft.cropY });
  const [w, h] = pixel(source, { x: draft.cropWidth, y: draft.cropHeight });
  return {
    crop: [x, y, w, h],
    rotation: Number(draft.rotation),
    skew: Number(draft.skew),
    perspective: Number(draft.perspective),
    rectify: draft.rectify,
    flip: draft.flip,
  };
}

export function commitAssessment(
  stored: PlanarSurface | undefined,
  reference: SourceFrame,
  source: SourceFrame,
  key: ReviewTool,
  draft: SurfaceDraft,
  automatic: boolean,
) {
  const state = stored ?? newPlanarSurface(reference);
  if (!sameSource(state.source, reference)) throw new Error('Mapping source changed');
  if (key === 'prepare') return preparePhoto(state, source, preparation(source, draft));
  if (key === 'calibrate') {
    const input: CalibrationInput =
      draft.method === 'lines'
        ? {
            ...lengths(draft),
            method: 'lines',
            horizontal: [
              pixel(source, draft.horizontal.start),
              pixel(source, draft.horizontal.end),
            ],
            vertical: [pixel(source, draft.vertical.start), pixel(source, draft.vertical.end)],
          }
        : { ...lengths(draft), method: 'dimensions' };
    return calibrate(state, input);
  }
  const fraction = Math.sqrt(Number(draft.usable) / 100);
  const input: AlignmentInput = draft.referenceOnly
    ? { method: 'reference' }
    : {
        method: automatic ? 'automatic' : 'manual',
        pairs: pairKeys.map((key) => ({
          detail: pixel(source, draft[key].start),
          reference: pixel(reference, draft[key].end),
        })),
        offset: pixel(reference, { x: draft.offsetX, y: draft.offsetY }),
        usable: [
          ((1 - fraction) * source.width) / 2,
          ((1 - fraction) * source.height) / 2,
          fraction * source.width,
          fraction * source.height,
        ],
      };
  return acceptDetail(state, source, input);
}

export function savedDraft(
  state: PlanarSurface | undefined,
  source: SourceFrame | undefined,
  key: ReviewTool,
  unit: string,
) {
  const draft = defaults(unit);
  if (!state || !source) return draft;
  if (key === 'prepare') {
    const frame =
      source.id === state.source.id
        ? state.frame
        : state.details.find((item) => item.source.id === source.id);
    if (!frame || !sameSource(frame.source, source)) return draft;
    const input = frame.input;
    const [x, y, w, h] = input.crop;
    const start = percent(source, [x, y]);
    const size = percent(source, [w, h]);
    return {
      ...draft,
      cropX: start.x,
      cropY: start.y,
      cropWidth: size.x,
      cropHeight: size.y,
      flip: input.flip,
      rectify: input.rectify,
      rotation: String(input.rotation),
      skew: String(input.skew),
      perspective: String(input.perspective),
    };
  }
  if (key === 'calibrate') {
    const input = state.calibration?.input;
    if (!input) return draft;
    if (input.method === 'lines') {
      for (const line of lineKeys)
        draft[line] = {
          start: percent(source, input[line][0]),
          end: percent(source, input[line][1]),
        };
    }
    return {
      ...draft,
      method: input.method,
      unit: input.unit,
      width: String(input.width),
      height: String(input.height),
    };
  }
  const alignment = state.alignments.find((item) => sameSource(item.source, source));
  if (!alignment) return draft;
  const input = alignment.input;
  if (input.method === 'reference') return { ...draft, referenceOnly: true };
  const offset = percent(state.source, input.offset);
  pairKeys.forEach((key, i) => {
    const pair = input.pairs[i]!;
    draft[key] = {
      start: percent(source, pair.detail),
      end: percent(state.source, pair.reference),
    };
  });
  return {
    ...draft,
    offsetX: offset.x,
    offsetY: offset.y,
    manualPairs: true,
    usable: String(
      Math.min(100, (((100 * input.usable[2]) / source.width) * input.usable[3]) / source.height),
    ),
  };
}
