import type { SurfaceJournal } from '../../../platform/projects/surface-journal';
import type { SaveState } from '../../controls/save-status/types';
import type { ToolItem } from '../../controls/tool-rail/types';
import type { EditorLayer } from '../types';
import { drawingTools } from './constants';
import type { DrawingCopy } from './copy';
import type { DrawingReview } from './createDrawingReview';
import { layerMeta, layerName } from './DrawingLayers';
import type { Layer, Tool } from './types';

/** The drawing model's layers as the editor shell lists them. Ids become strings. */
export const editorLayers = (model: DrawingReview, copy: DrawingCopy): EditorLayer[] =>
  model.layers().map((layer: Layer) => ({
    id: String(layer.id),
    name: layerName(layer, copy),
    kind: layer.kind,
    parent: layer.parent ? String(layer.parent) : undefined,
    visible: layer.visible,
    locked: layer.locked,
    swatch: { color: layer.color, fill: layer.fill },
    meta: layerMeta(model, layer, copy),
    expanded: layer.kind === 'folder' ? layer.expanded : undefined,
  }));

export const editorTools = (copy: DrawingCopy): ToolItem<Tool>[] =>
  drawingTools.map((tool) => ({ ...tool, label: copy[tool.id] }));

/** A recovery conflict needs the owner's action, so it reads as an error, not as saving. */
export function drawingSaveState(model: DrawingReview, journal?: SurfaceJournal): SaveState {
  if (model.failed() || journal?.conflict) return 'error';
  if (model.busy()) return 'saving';
  if (Object.values(model.drafts()).some((draft) => draft.pending.length)) return 'draft';
  return 'saved';
}
