import type { JSX } from 'solid-js';
import type { EditorCopy, EditorLayer, LayerId } from '../types';

export type LayerPanelProps = {
  copy: EditorCopy;
  empty?: boolean;
  layers: readonly EditorLayer[];
  active: LayerId;
  onSelect: (layer: LayerId) => void;
  onToggleVisible: (layer: LayerId) => void;
  onCalibrate?: () => void;
  /** Rendered above the layer list. */
  lead?: JSX.Element;
  /** Rendered below the layer list. */
  detail?: JSX.Element;
  /**
   * List layers as one tree in the given order: the master and folders are selectable rows,
   * folders nest to any depth and work phases stay in place instead of their own section.
   */
  tree?: boolean;
  /** Each row control's `data-control-id`. */
  rowControlId?: (kind: LayerControl) => string;
  /** When given, folders open and close from each layer's `expanded`, not from local state. */
  onToggleExpand?: (folder: LayerId) => void;
};

export type LayerControl = 'select' | 'visibility' | 'expand';

export type LayerRowProps = Pick<
  LayerPanelProps,
  'copy' | 'layers' | 'active' | 'onSelect' | 'onToggleVisible' | 'rowControlId'
> & { id: LayerId };

export type LayerLabelProps = { id: LayerId; layer?: EditorLayer };

export type LayerMeasurementsProps = Pick<LayerPanelProps, 'copy' | 'layers'>;
