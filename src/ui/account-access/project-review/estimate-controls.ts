import type { ControlContract } from '../../control-registry/types';
import type { EstimateCopy } from '../../../platform/estimates/copy';

const phases = [
  'add',
  'newName',
  'name',
  'phase',
  'earlier',
  'later',
  'duplicate',
  'split',
  'combine',
  'combineWith',
  'archive',
  'restore',
  'scopeSurface',
  'scopeLink',
  'assessment',
  'mask',
  'measurement',
  'acknowledge',
  'mode',
  'time',
  'productivity',
  'hoursOutput',
  'productivityOutput',
  'multiplier',
  'factorReview',
  'keepHours',
  'adjustHours',
  'cancel',
  'price',
  'rate',
  'material',
  'units',
] as const satisfies readonly (keyof EstimateCopy | 'newName' | 'scopeLink')[];
const finance = [
  'selection',
  'choose',
  'newExtra',
  'extraScope',
  'extraName',
  'extraMethod',
  'extraHours',
  'extraRate',
  'includeExtra',
  'removeExtra',
  'newAdjustment',
  'adjustmentName',
  'adjustmentPercent',
  'removeAdjustment',
  'tax',
  'taxPercent',
  'assumptions',
  'snapshot',
  'version',
  'issue',
] as const satisfies readonly (keyof EstimateCopy)[];
export const phaseControl = (key: (typeof phases)[number]) => 'estimate.phase.' + key;
export const financeControl = (key: (typeof finance)[number]) => 'estimate.finance.' + key;

export const estimateControls: readonly ControlContract[] = [
  ...phases.map((key): ControlContract => ({
    id: phaseControl(key),
    labelKey: key === 'newName' ? 'add' : key === 'scopeLink' ? 'scopeSurface' : key,
    helpKey: key === 'mask' || key === 'scopeLink' ? 'maskHelp' : 'transient',
    command: key === 'scopeLink' ? 'Open authorized opaque surface' : 'Review work phase ' + key,
    permission: 'Unlocked account-local project author',
    prerequisite: 'Active phase and applicable scope, input mode or pricing method',
    valueSource: 'Encrypted project hierarchy, committed geometry and saved estimate versions',
    behavior: 'functional',
    owner:
      key === 'scopeLink'
        ? 'M-05'
        : ['assessment', 'mask', 'measurement', 'acknowledge'].includes(key)
          ? 'M-16'
          : 'M-09',
    composition: 'Estimate review · Work phases',
    unavailable: {
      failure: 'Show validation or milestone availability',
      empty: 'Disable until a phase or applicable source exists',
      locked: 'Clear phase inputs',
    },
  })),
  ...finance.map((key): ControlContract => ({
    id: financeControl(key),
    labelKey: key,
    helpKey: 'unavailable',
    command: 'Review financial input ' + key,
    permission: 'Unlocked account-local project author with full estimate review access',
    prerequisite: 'Authorized project, selected objects and applicable pricing inputs',
    valueSource: 'Encrypted estimate versions and client-side restoration-v1 calculations',
    behavior: 'functional',
    owner: 'M-09',
    composition: 'Estimate review · Financials',
    unavailable: {
      failure: 'Show field validation and inhibit capture',
      empty: 'Show missing results and empty review versions',
      locked: 'Clear financial review',
    },
  })),
];
