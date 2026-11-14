import type { Surface } from './types';

export const assessmentVersions = (surface: Surface) => [
  'current',
  ...(surface.checkpoints ?? []).map(({ id }) => id),
];

export function selectAssessment(surface: Surface, version: string) {
  if (version !== 'current') {
    const checkpoint = surface.checkpoints?.find(({ id }) => id === version);
    return (
      checkpoint && {
        name: checkpoint.name,
        date: checkpoint.createdAt,
        state: checkpoint.assessment,
      }
    );
  }
  const reference = surface.images.find(({ role }) => role === 'mapping');
  const state = surface.assessments?.find(({ source }) => source.id === reference?.id);
  return { name: undefined, date: undefined, state };
}
