import { registerPlatformControls } from '../register-platform-controls';

export const vaultControls = [
  ...registerPlatformControls(
    {
      composition: 'Local vault settings',
      owner: 'M-03',
      permission: 'Current signed-in account',
      valueSource: 'Account-bound vault and browser storage',
      helpKey: 'keyHelp',
      unavailable: {
        failure: 'Show recovery or storage error.',
        empty: 'Offer setup or restore for an absent vault.',
        locked: 'Require unlock for note, trust, backup, approve and forget.',
      },
    },
    [
      ['vault.setup.generate', 'create', 'Generate pending recovery material', 'No local vault'],
      [
        'vault.setup.confirm',
        'create',
        'Initialize encrypted storage with acknowledged recovery material',
        'No local vault and saved recovery key acknowledged',
      ],
      ['vault.restore.open', 'restore', 'Open encrypted vault restore', 'No local vault'],
      [
        'vault.restore.submit',
        'restore',
        'Restore encrypted vault from matching key and backup',
        'Matching recovery file and key',
      ],
      ['vault.request.open', 'request', 'Show device recovery request', 'No local vault'],
      [
        'vault.request.pair',
        'request',
        'Generate single-use device pairing code',
        'No existing pairing request',
      ],
      [
        'vault.request.accept',
        'accept',
        'Import encrypted device approval',
        'Pending pair and acknowledged key',
      ],
      [
        'vault.note.save',
        'save',
        'Encrypt and save the local vault note',
        'Unlocked vault with changed note',
      ],
      ['vault.trust', 'remember', 'Change remembered browser policy', 'Unlocked vault'],
      ['vault.backup.download', 'backup', 'Download encrypted vault backup', 'Unlocked vault'],
      [
        'vault.approval.open',
        'approve',
        'Open device approval form',
        'Unlocked vault on Account security',
      ],
      [
        'vault.forget.open',
        'forget',
        'Show irreversible device forget confirmation',
        'Unlocked vault on Account security',
      ],
      [
        'vault.forget.confirm',
        'forget',
        'Forget local vault after explicit confirmation',
        'Unlocked vault and discard acknowledged',
      ],
    ],
  ),
];
