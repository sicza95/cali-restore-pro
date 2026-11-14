import type { ControlContract } from '../../control-registry/types';
import type { CheckpointCopy } from './copy';

const checkpoints = {
  mode: 'Open surface checkpoint and measurement review',
  version: 'Select primary review checkpoint',
  compare: 'Select comparison checkpoint',
  linked: 'Link comparison pan and magnification',
  zoom: 'Adjust primary magnification',
  secondZoom: 'Adjust unlinked comparison magnification',
  overlay: 'Show added and removed damage coverage',
  name: 'Enter checkpoint name',
  create: 'Capture the committed assessment as a named checkpoint',
  restore: 'Open restore confirmation',
  confirm: 'Restore the selected assessment and preserve the previous current',
  cancel: 'Close restore confirmation',
  panX: 'Pan the primary assessment horizontally',
  panY: 'Pan the primary assessment vertically',
  'panX.second': 'Pan the comparison assessment horizontally',
  'panY.second': 'Pan the comparison assessment vertically',
  unit: 'Change review area display units',
} satisfies Partial<
  Record<keyof CheckpointCopy | 'panX' | 'panY' | 'panX.second' | 'panY.second', string>
>;
const patterns = {
  kind: 'Select tile starter',
  motif: 'Edit a short text motif',
  spacing: 'Set tile spacing',
  angle: 'Set tile angle',
  size: 'Set motif size',
  weight: 'Set stroke width',
  color: 'Select tile color',
  mono: 'Switch to monochrome legend',
  preset: 'Select named review preset version',
  presetName: 'Name review preset',
  save: 'Save an encrypted personal pattern version',
  apply: 'Preview the selected pattern in the legend',
} satisfies Partial<Record<keyof CheckpointCopy, string>>;

export const checkpointControls: readonly ControlContract[] = [
  ...Object.entries(checkpoints).map(([key, command]): ControlContract => ({
    id: 'checkpoint.review.' + key,
    labelKey: key,
    helpKey: 'restoreHelp',
    command,
    permission: 'Authorized local project and unlocked vault',
    prerequisite: 'Selected surface. Compare, zoom and restore require a matching selection.',
    valueSource: 'Encrypted assessment checkpoints and measured coverage',
    behavior: 'functional',
    owner: 'M-15',
    composition: 'Surface checkpoint review',
    unavailable: {
      failure: 'Show validation or measurement state',
      empty: 'Disable checkpoint-dependent actions',
      locked: 'Clear review',
    },
  })),
  ...Object.entries(patterns).map(([key, command]): ControlContract => ({
    id: 'pattern.review.' + key,
    labelKey: key,
    helpKey: 'personal',
    command,
    permission: 'Unlocked vault and authorized surface or personal library',
    prerequisite: 'Pattern review; named preset required to save and a motif when applicable',
    valueSource: 'Encrypted personal presets and current tile editor',
    behavior: 'functional',
    owner: 'M-15',
    composition: 'Surface pattern review and settings library',
    unavailable: {
      failure: 'Disable invalid motif or unnamed preset',
      empty: 'Show no saved patterns',
      locked: 'Clear review',
    },
  })),
  ...['pattern.review.library', 'settings.libraries'].map((id): ControlContract => ({
    id,
    labelKey: 'openLibrary',
    helpKey: 'personal',
    command: 'Open the account-bound libraries route',
    permission: 'Signed in, with vault unlock required for library contents',
    prerequisite: 'Settings or surface pattern review',
    valueSource: 'Application route',
    behavior: 'functional',
    owner: 'M-08',
    composition: 'Preferences and surface pattern review',
    unavailable: {
      failure: 'Show access or vault error',
      empty: 'Show empty review library',
      locked: 'Show vault gate',
    },
  })),
];
