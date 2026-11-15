import { registerPlatformControls } from '../register-platform-controls';

export const projectOperationControls = [
  ...registerPlatformControls(
    {
      composition: 'Project detail hierarchy and settings',
      owner: 'M-05',
      permission: 'Unlocked vault and authorized account-local project',
      valueSource: 'Decrypted project document and form',
      helpKey: 'missing',
      unavailable: {
        failure: 'Keep the last durable local revision and show error.',
        empty: 'Hide inactive hierarchy controls.',
        locked: 'Clear decrypted project and require unlock.',
      },
    },
    [
      [
        'project.object.select',
        'object',
        'Select object in authorized project',
        'Unarchived authorized local project',
      ],
      [
        'project.surface.select',
        'surface',
        'Select surface in selected object',
        'Unarchived authorized local project',
      ],
      [
        'project.currency',
        'currency',
        'Enter project currency',
        'Unarchived authorized local project',
      ],
      [
        'project.object.rename',
        'rename',
        'Rename selected object in encrypted project',
        'Selected object',
      ],
      [
        'project.surface.rename',
        'rename',
        'Rename selected surface in encrypted project',
        'Selected surface',
      ],
      [
        'project.object.create',
        'addObject',
        'Add an object with its default surface',
        'Active project',
      ],
      [
        'project.surface.create',
        'addSurface',
        'Add a surface to the selected object',
        'Selected object',
      ],
      ['project.rename', 'rename', 'Rename encrypted project', 'Active project'],
      ['project.units', 'units', 'Choose project unit default', 'Project settings form'],
      ['project.object.units', 'units', 'Choose object override or inherit', 'Selected object'],
      ['project.surface.units', 'units', 'Choose surface override or inherit', 'Selected surface'],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Project originals',
      owner: 'M-05',
      permission: 'Unlocked vault and authorized surface',
      valueSource: 'Encrypted local attachments and form',
      helpKey: 'unavailable',
      unavailable: {
        failure: 'Keep the selected file for retry on stage or save failure.',
        empty: 'Show no files and omit per-file actions.',
        locked: 'Abort staging and hide filenames.',
      },
    },
    [
      ['originals.file', 'file', 'Choose an original to encrypt', 'Active surface'],
      [
        'originals.remove',
        'remove',
        'Remove original reference and local encrypted bytes',
        'Existing attachment',
      ],
      ['originals.role', 'role', 'Select role for an original before attachment', 'Active surface'],
      [
        'originals.change-role',
        'role',
        'Persist mapping or reference role for an attached original',
        'Existing attachment',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Encrypted project backup',
      owner: 'M-07',
      permission: 'Unlocked account vault',
      valueSource: 'Authenticated standalone encrypted backup',
      helpKey: 'keep',
      unavailable: {
        failure: 'Show wrong-key or damaged archive error.',
        empty:
          'Hide the export action without a project or the download without an acknowledged key.',
        locked: 'Cancel transfer and hide backup material.',
      },
    },
    [
      [
        'backup.restore',
        'restore',
        'Restore authenticated project backup',
        'Local vault, selected backup and matching key',
      ],
      [
        'backup.export',
        'prepare',
        'Export authenticated project backup',
        'Open local project with its originals',
      ],
      [
        'backup.cancel',
        'cancel',
        'Cancel the in-flight backup operation',
        'Backup operation in progress',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Hosted project revision key transfer',
      owner: 'M-07',
      permission: 'Authorized project owner and unlocked account vault',
      valueSource: 'Encrypted hosted revision and account-bound transfer envelope',
      helpKey: 'private',
      unavailable: {
        failure: 'Reject unauthorized, expired or invalid transfer.',
        empty: 'Hide Send until there is an acknowledged revision.',
        locked: 'Clear transient code and require unlock.',
      },
    },
    [
      [
        'project.key.send.open',
        'send',
        'Open encrypted project key transfer',
        'Acknowledged hosted revision',
      ],
      [
        'project.key.send',
        'create',
        'Encrypt project key for paired device',
        'Acknowledged hosted revision and recipient owner account',
      ],
      [
        'project.key.receive.open',
        'receive',
        'Open hosted revision import',
        'Unlocked project library',
      ],
      [
        'project.key.receive',
        'open',
        'Import project key and authorized encrypted revision',
        'Unexpired transfer code and authorized recipient owner',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Hosted project lifecycle',
      owner: 'M-07',
      permission: 'Authorized hosted owner and unlocked vault',
      valueSource: 'Project lifecycle and continuity API',
      helpKey: 'continuity',
      unavailable: {
        failure: 'Show blocker or request failure.',
        empty: 'Hide actions outside the entry’s retention state.',
        locked: 'Require unlock to display project commands.',
      },
    },
    [
      [
        'project.trash.open',
        'trash',
        'Open hosted project lifecycle controls',
        'Hosted trash or selected hosted project',
      ],
      ['project.trash.refresh', 'refresh', 'Refresh server project trash', 'Hosted trash panel'],
      [
        'project.trash.restore',
        'restore',
        'Restore hosted project during retention',
        'Recoverable hosted trash entry',
      ],
      [
        'project.trash.purge',
        'purge',
        'Queue hosted project purge',
        'Purge-eligible hosted trash entry and confirmation',
      ],
      [
        'project.trash.delete',
        'delete',
        'Delete hosted project after continuity checks',
        'Hosted project continuity checks and confirmation',
      ],
    ],
  ),
];
