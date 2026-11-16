import type { PlanarSurface } from './planar-types';
import type { Attachment, Surface } from './types';

/** New images for a surface; assessments lose removed photos, and untouched ones stay as they are. */
export function updateSurfaceImages(surface: Surface, images: Attachment[]): Partial<Surface> {
  const retained = new Set(images.map((image) => image.id));
  const kept = (entry: { source: { id: string } }) => retained.has(entry.source.id);
  return {
    images,
    assessments: surface.assessments?.filter(kept).map((entry) =>
      entry.details.every(kept) && entry.alignments.every(kept)
        ? entry
        : {
            ...entry,
            details: entry.details.filter(kept),
            alignments: entry.alignments.filter(kept),
          },
    ),
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
