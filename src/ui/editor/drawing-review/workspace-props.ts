import type { SurfaceJournal } from '../../../platform/projects/surface-journal';
import type { SaveState } from '../../controls/save-status/types';
import type { ToolItem } from '../../controls/tool-rail/types';
import type { EditorLayer } from '../types';
import { drawingTools } from './constants';
import type { DrawingCopy } from './copy';
import type { DrawingReview } from './createDrawingReview';
import { layerName } from './DrawingLayers';
import type { Layer, Tool } from './types';

/** The drawing model's layers as the editor shell lists them. Ids become strings. */
export const editorLayers = (layers: readonly Layer[], copy: DrawingCopy): EditorLayer[] =>
  layers.map((layer) => ({
    id: String(layer.id),
    name: layerName(layer, copy),
    kind: layer.kind,
    parent: layer.parent ? String(layer.parent) : undefined,
    visible: layer.visible,
    locked: layer.locked,
    swatch: { color: layer.color, fill: layer.fill },
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
