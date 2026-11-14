import type { PlanarSurface } from './planar-types';
import type { Attachment, Surface } from './types';

export function updateSurfaceImages(surface: Surface, images: Attachment[]): Partial<Surface> {
  const retained = new Set(images.map((image) => image.id));
  return {
    images,
    assessments: surface.assessments
      ?.filter((entry) => retained.has(entry.source.id))
      .map((entry) => ({
        ...entry,
        details: entry.details.filter((detail) => retained.has(detail.source.id)),
        alignments: entry.alignments.filter((alignment) => retained.has(alignment.source.id)),
      })),
  };
}

export function remapSurfaceImages(surface: Surface, ids: ReadonlyMap<string, string>): Surface {
  const remap = <T extends { id: string }>(entry: T): T => {
    const id = ids.get(entry.id);
    if (!id) throw new Error('Missing restored photo');
    return { ...entry, id };
  };
  const remapAssessment = (entry: PlanarSurface): PlanarSurface => ({
    ...entry,
    source: remap(entry.source),
    frame: { ...entry.frame, source: remap(entry.frame.source) },
    details: entry.details.map((detail) => ({ ...detail, source: remap(detail.source) })),
    alignments: entry.alignments.map((alignment) => ({
      ...alignment,
      source: remap(alignment.source),
    })),
  });
  return {
    ...surface,
    images: surface.images.map(remap),
    assessments: surface.assessments?.map(remapAssessment),
    checkpoints: surface.checkpoints?.map((checkpoint) => ({
      ...checkpoint,
      assessment: remapAssessment(checkpoint.assessment),
    })),
  };
}
