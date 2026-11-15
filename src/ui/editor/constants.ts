import type { EditorCopy } from './types';

export const referencePhoto = '/photos/painted-plaster.png';

/** English shell strings; adapters override them through the `copy` prop. */
export const editorCopy: EditorCopy = {
  editor: 'Assessment editor',
  workspaceActions: 'Workspace actions',
  undo: 'Undo',
  redo: 'Redo',
  focusCanvas: 'Focus canvas',
  showPanels: 'Show panels',
  export: 'Export',
  exportUnavailable: 'Export is not available here',
  canvas: 'Assessment canvas',
  maskOpacity: 'Mask opacity',
  perStrokeSave: 'Per-stroke save',
  inspector: 'Surface inspector',
  inspectorTabs: 'Inspector',
  layers: 'Layers',
  measurements: 'Measurements',
  hideLayer: (name) => `Hide ${name}`,
  showLayer: (name) => `Show ${name}`,
  expandFolder: (name) => `Expand ${name}`,
  collapseFolder: (name) => `Collapse ${name}`,
  emptyTitle: 'No assessment yet',
  emptyNote: 'Add an overview photo to define the surface.',
  uniqueCoverage: 'Unique coverage',
  workPhases: 'Work phases',
  quantities: 'Surface quantities',
  assessedSurface: 'Assessed surface',
  uniqueArea: (name) => `${name} · unique`,
  coverage: 'Coverage',
  uniqueNote: 'Unique coverage counts overlapping damage once.',
  phaseNote: 'Treatment areas are measured separately.',
  calibration: 'Calibration & units',
  calibrationUnavailable: 'Add a reference photo first',
};
