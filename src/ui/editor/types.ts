import type { SaveLabels } from '../controls/save-status/types';
export type LayerId = string;

/** One row of the surface model as the editor shell shows it. */
export type EditorLayer = {
  id: LayerId;
  name: string;
  kind: 'master' | 'damage' | 'phase' | 'folder';
  /** Id of the folder this layer sits in. */
  parent?: LayerId;
  visible: boolean;
  locked?: boolean;
  /** Measured area in m². */
  area?: number;
  swatch: { color: string; fill: 'solid' | 'hatch' | 'none' };
  /** A second line under the name, for example "3 · Mark · Pending 1". */
  meta?: string;
  /** A folder's open state when the host owns it (see `LayerPanel`'s `onToggleExpand`). */
  expanded?: boolean;
};

/** Every string the editor shell and its inspector render themselves. */
export type EditorCopy = {
  /** Language for numbers and units; English when not given. */
  language?: 'en' | 'hu';
  editor: string;
  workspaceActions: string;
  undo: string;
  redo: string;
  focusCanvas: string;
  showPanels: string;
  export: string;
  exportUnavailable: string;
  canvas: string;
  maskOpacity: string;
  perStrokeSave: string;
  inspector: string;
  inspectorTabs: string;
  layers: string;
  measurements: string;
  hideLayer: (name: string) => string;
  showLayer: (name: string) => string;
  expandFolder: (name: string) => string;
  collapseFolder: (name: string) => string;
  emptyTitle: string;
  emptyNote: string;
  uniqueCoverage: string;
  workPhases: string;
  quantities: string;
  assessedSurface: string;
  uniqueArea: (name: string) => string;
  coverage: string;
  uniqueNote: string;
  phaseNote: string;
  calibration: string;
  calibrationUnavailable: string;
  /** The header's save status text for each state. */
  save: SaveLabels;
  retry: string;
};
