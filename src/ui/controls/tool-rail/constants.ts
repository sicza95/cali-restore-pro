import type { ControlContract } from '../../control-registry/types';

export const tools = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: 'select' },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: 'brush' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: 'eraser' },
  { id: 'pen', label: 'Pen', shortcut: 'P', icon: 'pen' },
  { id: 'nodes', label: 'Edit points', shortcut: 'A', icon: 'nodes' },
  { id: 'frame', label: 'Crop', shortcut: 'C', icon: 'frame' },
  { id: 'hand', label: 'Pan', shortcut: 'H', icon: 'hand' },
] as const;

export const toolRailRegistry = tools.map(({ id }): ControlContract => ({
  id: `editor.tool.${id}`,
  labelKey: `editor.tool.${id}.label`,
  helpKey: `editor.tool.${id}.help`,
  command: `select-tool(${id})`,
  permission: 'Access to the review composition',
  prerequisite: 'A visible tool rail',
  valueSource: 'Transient active tool selection',
  behavior: 'review',
  owner: id === 'frame' ? 'M-13' : 'M-14',
  composition: 'editor-tool-rail--on-photograph',
  unavailable: {
    failure: 'Selection makes no engine or storage request',
    empty: 'Workspace omits the rail in its empty state',
    locked: 'Storybook review uses synthetic data and has no vault',
  },
}));
