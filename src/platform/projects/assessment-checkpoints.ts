import { assertID } from '../vault/file-format';
import { assertDrawing } from './drawing-state';
import { assertPlanarState, sameSource } from './planar-state';
import type { PlanarSurface } from './planar-types';

export type AssessmentCheckpoint = {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  assessment: PlanarSurface;
};
export const checkpointLimit = 64;
export const checkpointSources = (state: PlanarSurface) => [
  state.source,
  ...state.details.map((detail) => detail.source),
  ...state.alignments.map((alignment) => alignment.source),
];

export function captureCheckpoint(name: string, assessment: PlanarSurface): AssessmentCheckpoint {
  name = name.trim();
  if (!name || name.length > 80) throw new Error('Invalid checkpoint name');
  return { version: 1, id: crypto.randomUUID(), name, createdAt: Date.now(), assessment };
}

export function restoreCheckpoint(current: PlanarSurface, checkpoint: AssessmentCheckpoint) {
  const { assessment } = checkpoint;
  if (!sameSource(current.source, assessment.source))
    throw new Error('Checkpoint reference changed');
  return { ...assessment, revision: current.revision + 1 };
}

export function assertCheckpoints(checkpoints: AssessmentCheckpoint[], attachments: Set<string>) {
  if (
    !Array.isArray(checkpoints) ||
    checkpoints.length > checkpointLimit ||
    new Set(checkpoints.map(({ id }) => id)).size !== checkpoints.length
  )
    throw new Error('Invalid checkpoints');
  for (const checkpoint of checkpoints) {
    assertID(checkpoint.id);
    if (
      checkpoint.version !== 1 ||
      !checkpoint.name.trim() ||
      checkpoint.name.length > 80 ||
      !Number.isSafeInteger(checkpoint.createdAt) ||
      checkpoint.createdAt < 0
    )
      throw new Error('Invalid checkpoint');
    const state = checkpoint.assessment;
    assertPlanarState(state);
    if (state.drawing) assertDrawing(state.drawing);
    if (!checkpointSources(state).every(({ id }) => attachments.has(id)))
      throw new Error('Checkpoint photo is not attached');
  }
}
