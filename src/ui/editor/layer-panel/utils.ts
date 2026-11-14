import type { EditorLayer, LayerId } from '../types';

/**
 * Lists are keyed by id, not by object, so a row keeps its DOM and keyboard
 * focus when the model replaces a layer with an updated copy.
 */
export const layerIds = (
  layers: readonly EditorLayer[],
  match: (layer: EditorLayer) => boolean,
): LayerId[] => layers.filter(match).map((layer) => layer.id);

export const findLayer = (layers: readonly EditorLayer[], id: LayerId) =>
  layers.find((layer) => layer.id === id);

export const masterLayer = (layers: readonly EditorLayer[]) =>
  layers.find((layer) => layer.kind === 'master');

/** Folder areas count overlapping damage once, so their share of the surface is the coverage. */
export function coverage(layers: readonly EditorLayer[]): number | undefined {
  const surface = masterLayer(layers)?.area;
  const folders = layers.filter((layer) => layer.kind === 'folder' && layer.area !== undefined);
  if (!surface || !folders.length) return undefined;
  return (folders.reduce((sum, layer) => sum + (layer.area ?? 0), 0) / surface) * 100;
}
