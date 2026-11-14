import type { EditorCopy, EditorLayer } from '../../ui/editor/types';

const accent = 'var(--cr-accent)';
const warning = 'var(--cr-warning)';

/** Synthetic surface for the review stories. The areas are illustrative, not measured. */
export const sampleLayers: readonly EditorLayer[] = [
  {
    id: 'master',
    name: 'Master boundary',
    kind: 'master',
    visible: true,
    area: 6,
    swatch: { color: accent, fill: 'none' },
  },
  {
    id: 'damage',
    name: 'Paint loss',
    kind: 'folder',
    visible: true,
    area: 0.78,
    swatch: { color: accent, fill: 'none' },
  },
  {
    id: 'flaking',
    name: 'Flaking',
    kind: 'damage',
    parent: 'damage',
    visible: true,
    area: 0.42,
    swatch: { color: accent, fill: 'solid' },
  },
  {
    id: 'lacunae',
    name: 'Lacunae',
    kind: 'damage',
    parent: 'damage',
    visible: true,
    area: 0.36,
    swatch: { color: accent, fill: 'none' },
  },
  {
    id: 'cracks',
    name: 'Cracks',
    kind: 'damage',
    visible: false,
    area: 0.14,
    swatch: { color: warning, fill: 'none' },
  },
  {
    id: 'cleaning',
    name: 'Cleaning',
    kind: 'phase',
    visible: false,
    area: 0.9,
    swatch: { color: warning, fill: 'solid' },
  },
];

export const sampleSurface = {
  title: 'North wall',
  breadcrumb: ['North Chapel', 'Wall painting'],
} as const;

export const defaults = { tool: 'brush', layer: 'flaking', width: 18, opacity: 40 } as const;

/** Wording that is only true of the stories: nothing here edits or exports. */
export const reviewCopy: Partial<EditorCopy> = {
  undo: 'Undo (no edits in this story)',
  redo: 'Redo (no edits in this story)',
  exportUnavailable: 'Output is not connected in this UI story',
};

export const noHistory = {
  canUndo: false,
  canRedo: false,
  onUndo: () => undefined,
  onRedo: () => undefined,
};
