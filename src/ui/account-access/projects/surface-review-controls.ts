import type { ControlContract } from '../../control-registry/types';

export const tools = ['prepare', 'align', 'calibrate'] as const;
export const directions = ['left', 'right', 'up', 'down'] as const;
export const pairKeys = ['pairOne', 'pairTwo'] as const;
export const lineKeys = ['horizontal', 'vertical'] as const;
export type ReviewTool = (typeof tools)[number];

export const fields = {
  cropX: [0, 99, 0],
  cropY: [0, 99, 0],
  cropWidth: [1, 100, 100],
  cropHeight: [1, 100, 100],
  rotation: [-180, 180, 0],
  skew: [-45, 45, 0],
  perspective: [-45, 45, 0],
  offsetX: [-100, 100, 0],
  offsetY: [-100, 100, 0],
  usable: [1, 100, 100],
  width: [0.001, 1000000, 0],
  height: [0.001, 1000000, 0],
} as const;
export type ReviewField = keyof typeof fields;
export const toolFields: Record<ReviewTool, readonly ReviewField[]> = {
  prepare: ['cropX', 'cropY', 'cropWidth', 'cropHeight', 'rotation', 'skew', 'perspective'],
  align: ['offsetX', 'offsetY', 'usable'],
  calibrate: ['width', 'height'],
};

const photo = [
  'photo',
  'previous',
  'next',
  'surface',
  'zoom',
  'fit',
  'rotate',
  'focus',
  ...directions.map((direction) => 'pan.' + direction),
];
const review = [
  ...tools,
  ...Object.keys(fields),
  'flip',
  'rectify',
  'aspect',
  'original',
  'compare',
  'auto',
  'stopMatch',
  'manualPairs',
  'referenceOnly',
  'method',
  'unit',
  'reset',
  'apply',
  'cancel',
  ...[...pairKeys, ...lineKeys].flatMap((key) =>
    ['start', 'end'].flatMap((end) => ['x', 'y'].map((axis) => `${key}.${end}.${axis}`)),
  ),
];

function reviewPrerequisite(key: string) {
  if (key === 'stopMatch') return 'Automatic alignment job running';
  if (key === 'auto') return 'Separate available working images with overlapping landmarks';
  if (key.startsWith('pair'))
    return 'Alignment with manual correspondence enabled and fallback off';
  if (key.startsWith('horizontal.') || key.startsWith('vertical.'))
    return 'Mapping reference, calibration inspector and reference-line method';
  if (key === 'manualPairs') return 'Detail alignment with reference-only fallback off';
  return 'Selected supported photo and applicable tool';
}
export const surfaceControls: readonly ControlContract[] = [
  ...photo.map((key): ControlContract => ({
    id: 'surface.view.' + key,
    labelKey: key.split('.').at(-1)!,
    helpKey: 'previewUnavailable',
    command:
      key === 'surface' ? 'Navigate to authorized opaque surface route' : 'Change local photo view',
    owner: key === 'surface' ? 'M-05' : key.startsWith('pan.') ? 'M-14' : 'M-12',
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
    labelKey: key.split('.').at(-1)!,
    helpKey: key === 'auto' ? 'autoUnavailable' : 'transient',
    command: key === 'auto' ? 'Propose alignment landmarks for verification' : 'Edit ' + key,
    owner: 'M-13',
    composition: 'Surface review adapter',
    permission: 'Authorized project and unlocked vault',
    prerequisite: reviewPrerequisite(key),
    valueSource: 'Local draft and encrypted surface assessment',
    behavior: 'functional',
    unavailable: {
      failure: 'Show validation or availability reason',
      empty: 'Disable review without a preview',
      locked: 'Clear transient state and hide workspace',
    },
  })),
];
