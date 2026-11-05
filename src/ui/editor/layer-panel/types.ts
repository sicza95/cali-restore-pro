import type { LayerId } from '../types';

export type LayerPanelProps = {
  empty?: boolean;
  active: LayerId;
  onSelect: (layer: LayerId) => void;
  visible: ReadonlySet<LayerId>;
  onToggleVisible: (layer: LayerId) => void;
  onCalibrate: () => void;
};
