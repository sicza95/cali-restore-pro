import type { ControlContract } from '../../control-registry/types';

export const tools = ['prepare', 'align', 'calibrate'] as const;
export type ReviewTool = (typeof tools)[number];

export const fields = {
  cropX: [0, 99, 0],
  cropY: [0, 99, 0],
  cropWidth: [1, 100, 100],
  cropHeight: [1, 100, 100],
  rotation: [-180, 180, 0],
  skew: [-45, 45, 0],
  offsetX: [-100, 100, 0],
  offsetY: [-100, 100, 0],
  usable: [1, 100, 100],
  width: [0.001, 1000000, 0],
  height: [0.001, 1000000, 0],
} as const;
export type ReviewField = keyof typeof fields;
export const toolFields: Record<ReviewTool, readonly ReviewField[]> = {
  prepare: ['cropX', 'cropY', 'cropWidth', 'cropHeight', 'rotation', 'skew'],
  align: ['offsetX', 'offsetY', 'usable'],
  calibrate: ['width', 'height'],
};

const photo = ['photo', 'previous', 'next', 'surface', 'zoom', 'fit', 'rotate', 'focus'] as const;
const review = [
  ...tools,
  ...Object.keys(fields),
  'flip',
  'aspect',
  'original',
  'compare',
  'auto',
  'referenceOnly',
  'method',
  'unit',
  'reset',
  'apply',
  'cancel',
];
export const surfaceControls: readonly ControlContract[] = [
  ...photo.map((key): ControlContract => ({
    id: 'surface.view.' + key,
    labelKey: key,
    helpKey: 'previewUnavailable',
    command:
      key === 'surface' ? 'Navigate to authorized opaque surface route' : 'Change local photo view',
    owner: key === 'surface' ? 'M-05' : 'M-12',
    composition: 'Surface workspace',
    permission: 'Authorized project and unlocked vault',
    prerequisite: 'Authorized surface and applicable photo or viewport',
    valueSource: 'Encrypted project attachments and local viewport state',
    behavior: 'functional',
    unavailable: {
      failure: 'Show preview unavailable',
      empty: 'Disable photo commands without a target',
      locked: 'Hide workspace',
    },
  })),
  ...review.map((key): ControlContract => ({
    id: 'surface.review.' + key,
    labelKey: key,
    helpKey: 'transient',
    command: 'Review ' + key,
    owner: 'M-13',
    composition: 'Surface review adapter',
    permission: 'Authorized project and unlocked vault',
    prerequisite: 'Selected supported photo and applicable tool',
    valueSource: 'In-memory review parameters',
    behavior: 'review',
    unavailable: {
      failure: 'Show validation or availability reason',
      empty: 'Disable review without a preview',
      locked: 'Clear transient state and hide workspace',
    },
  })),
];
