export type Point = { x: number; y: number; handle?: { x: number; y: number } };
export type Operation = 'add' | 'subtract' | 'replace';
export type Shape = 'rectangle' | 'ellipse' | 'polygon';
export type LayerKind = 'master' | 'damage' | 'phase' | 'folder';
export type Tool = 'select' | 'hand' | 'brush' | 'eraser' | 'pen' | 'shape' | 'nodes' | 'master';
export type MarkAction = 'stroke' | 'erase' | 'path' | 'shape' | 'points' | 'batch';

export type Mark = {
  id: number;
  action: Exclude<MarkAction, 'points' | 'batch'>;
  points: Point[];
  closed: boolean;
  operation: Operation;
  width: number;
};

export type Layer = {
  id: number;
  kind: LayerKind;
  name: string;
  parent: number;
  visible: boolean;
  locked: boolean;
  expanded: boolean;
  opacity: number;
  color: string;
  fill: 'solid' | 'hatch' | 'none';
  outline: boolean;
  marks: Mark[];
};

export type Draft = { pending: Mark[]; undone: Mark[] };
export type HistoryEntry = {
  layer: number;
  action: MarkAction;
  before: Mark[];
  after: Mark[];
};

export type BrushOptions = {
  width: number;
  pressure: boolean;
  stabilize: boolean;
  strength: number;
  outline: boolean;
  finger: boolean;
};

export type Sketch = { points: Point[]; closed: boolean; index: number; mark?: Mark };
