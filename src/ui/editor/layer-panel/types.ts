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
  /** Rendered below the layer list. */
  detail?: JSX.Element;
};

export type LayerRowProps = Pick<
  LayerPanelProps,
  'copy' | 'layers' | 'active' | 'onSelect' | 'onToggleVisible'
> & { id: LayerId };

export type LayerMeasurementsProps = Pick<LayerPanelProps, 'copy' | 'layers'>;
