import type { BrushOptions, Layer, LayerKind, Tool } from './types';

export const drawingTools = [
  { id: 'select', icon: 'select', shortcut: 'V' },
  { id: 'hand', icon: 'hand', shortcut: 'H' },
  { id: 'brush', icon: 'brush', shortcut: 'B' },
  { id: 'eraser', icon: 'eraser', shortcut: 'E' },
  { id: 'pen', icon: 'pen', shortcut: 'P' },
  { id: 'shape', icon: 'shape', shortcut: 'S' },
  { id: 'nodes', icon: 'nodes', shortcut: 'A' },
  { id: 'master', icon: 'frame', shortcut: 'M' },
] as const satisfies ReadonlyArray<{ id: Tool; icon: string; shortcut: string }>;

export const control = (key: string) => 'surface.draw.' + key;
export { historyLimit } from '../../../platform/projects/surface-journal';
export const pointLimit = 512;
export const masterId = 1;
export const brushDefaults: BrushOptions = {
  width: 2,
  pressure: false,
  stabilize: false,
  strength: 35,
  outline: true,
  finger: false,
};
export const emptySketch = { points: [], closed: false, index: 0 };

export function newLayer(id: number, kind: LayerKind, parent = 0): Layer {
  return {
    id,
    kind,
    name: '',
    parent,
    visible: true,
    locked: false,
    expanded: true,
    opacity: 55,
    color: kind === 'phase' ? '#ffc875' : '#64dae9',
    fill: 'solid',
    outline: true,
    marks: [],
  };
}
