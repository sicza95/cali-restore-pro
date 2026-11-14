import { assertDimensions } from '../images/types';
import { fitDetail } from './planar-alignment';
import { calibrationScale } from './planar-calibration';
import { assertMask } from './planar-mask';
import {
  assertBounds,
  assertTransform,
  defaultPreparation,
  preparationMatrix,
  rect,
} from './planar-transform';
import type {
  AlignmentInput,
  CalibrationInput,
  PhotoPreparation,
  PlanarSurface,
  Preparation,
  SourceFrame,
} from './planar-types';

export function sameSource(a: SourceFrame, b: SourceFrame) {
  return (
    a.id === b.id &&
    a.width === b.width &&
    a.height === b.height &&
    a.embeddedPreview === b.embeddedPreview
  );
}

export const photoFrame = (source: SourceFrame): PhotoPreparation => ({
  source,
  input: defaultPreparation(source),
  revision: 0,
});

export function newPlanarSurface(source: SourceFrame): PlanarSurface {
  return {
    version: 1,
    revision: 0,
    source,
    frame: photoFrame(source),
    layers: [],
    categories: [],
    details: [],
    alignments: [],
  };
}

export function preparePhoto(
  state: PlanarSurface,
  source: SourceFrame,
  input: Preparation,
): PlanarSurface {
  preparationMatrix(source, input);
  const main = source.id === state.source.id;
  const previous = main
    ? state.frame
    : state.details.find((entry) => entry.source.id === source.id);
  if (previous && !sameSource(previous.source, source)) throw new Error('Photo frame changed');
  if (previous && JSON.stringify(previous.input) === JSON.stringify(input)) return state;
  const frame = { source, input, revision: state.revision + 1 };
  return main
    ? { ...state, revision: frame.revision, frame }
    : {
        ...state,
        revision: frame.revision,
        details: [...state.details.filter((entry) => entry.source.id !== source.id), frame],
      };
}

export function calibrate(state: PlanarSurface, input: CalibrationInput): PlanarSurface {
  calibrationScale(state.frame, input);
  return {
    ...state,
    revision: state.revision + 1,
    calibration: { input, revision: state.revision + 1, frameRevision: state.frame.revision },
  };
}

export function acceptDetail(
  state: PlanarSurface,
  source: SourceFrame,
  input: AlignmentInput,
): PlanarSurface {
  if (source.id === state.source.id) throw new Error('The reference cannot be aligned to itself');
  const detail = state.details.find((entry) => entry.source.id === source.id) ?? photoFrame(source);
  if (!sameSource(source, detail.source)) throw new Error('Photo frame changed');
  const alignment = {
    source,
    input,
    canonical: fitDetail(state, input, detail),
    frameRevision: state.frame.revision,
    preparationRevision: detail.revision,
  };
  if (alignment.canonical && input.method !== 'reference')
    assertTransform(alignment.canonical, rect(input.usable));
  return {
    ...state,
    revision: state.revision + 1,
    alignments: [...state.alignments.filter((entry) => entry.source.id !== source.id), alignment],
  };
}

export function categoryMembership(state: PlanarSurface) {
  const ids = new Set([...state.layers, ...state.categories].map((row) => row.id));
  if (ids.size !== state.layers.length + state.categories.length || ids.has(''))
    throw new Error('Invalid mask tree');
  const parents = new Map(state.categories.map((category) => [category.id, category.parent]));
  return new Map(
    [...state.categories, ...state.layers].map((row) => {
      const ancestors = new Set<string>();
      for (let parent = row.parent; parent !== undefined; parent = parents.get(parent)) {
        if (parent === row.id || ancestors.has(parent) || !parents.has(parent))
          throw new Error('Invalid mask tree');
        ancestors.add(parent);
      }
      return [row.id, ancestors];
    }),
  );
}

export function assertPlanarState(state: PlanarSurface) {
  const revision = (value: number) =>
    Number.isSafeInteger(value) && value >= 0 && value <= state.revision;
  const source = (item: SourceFrame) => {
    if (!item.id || typeof item.embeddedPreview !== 'boolean')
      throw new Error('Invalid photo source');
    assertDimensions(item.width, item.height);
  };
  if (
    state.version !== 1 ||
    !revision(state.revision) ||
    !sameSource(state.frame.source, state.source)
  )
    throw new Error('Invalid planar surface');
  if (
    state.layers.length + state.categories.length > 128 ||
    state.details.length > 128 ||
    state.alignments.length > 128
  )
    throw new Error('Planar surface exceeds document budget');
  const photos = new Map<string, PhotoPreparation>();
  for (const frame of [state.frame, ...state.details]) {
    source(frame.source);
    if (photos.has(frame.source.id) || !revision(frame.revision))
      throw new Error('Invalid photo revision');
    photos.set(frame.source.id, frame);
    preparationMatrix(frame.source, frame.input);
  }
  if (state.calibration) {
    if (!revision(state.calibration.revision) || !revision(state.calibration.frameRevision))
      throw new Error('Invalid calibration revision');
    if (state.calibration.frameRevision === state.frame.revision)
      calibrationScale(state.frame, state.calibration.input);
  }
  const accepted = new Set<string>();
  for (const alignment of state.alignments) {
    source(alignment.source);
    if (
      alignment.source.id === state.source.id ||
      accepted.has(alignment.source.id) ||
      !revision(alignment.frameRevision) ||
      !revision(alignment.preparationRevision)
    )
      throw new Error('Invalid alignment revision');
    accepted.add(alignment.source.id);
    const detail = photos.get(alignment.source.id) ?? photoFrame(alignment.source);
    if (!sameSource(detail.source, alignment.source)) throw new Error('Alignment source changed');
    if (alignment.input.method !== 'reference') {
      assertBounds(alignment.input.usable, alignment.source);
      if (!alignment.canonical) throw new Error('Missing canonical alignment');
      assertTransform(alignment.canonical, rect(alignment.input.usable));
    } else if (alignment.canonical) throw new Error('Reference-only mapping');
  }
  categoryMembership(state);
  if (state.master) assertMask(state.master);
  for (const layer of state.layers) {
    if (layer.kind !== 'damage' && layer.kind !== 'phase')
      throw new Error('Invalid mask layer role');
    assertMask(layer.mask);
  }
}

export function replaceMasks(
  state: PlanarSurface,
  masks: Pick<PlanarSurface, 'master' | 'layers' | 'categories'>,
) {
  const next = { ...state, ...masks, revision: state.revision + 1 };
  assertPlanarState(next);
  return next;
}
