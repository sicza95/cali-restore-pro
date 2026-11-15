import type { ControlContract } from '../../control-registry/types';

const defaults = {
  permission: 'Current account and matching local vault',
  valueSource: 'LocalVault status and IndexedDB',
  behavior: 'functional',
  owner: 'M-03',
  composition: 'Unlock vault and device approval',
} as const;

export const vaultEntryControls = {
  recovery: {
    ...defaults,
    id: 'app.vault.unlock-recovery',
    labelKey: 'unlock',
    helpKey: 'keyHelp',
    command: 'LocalVault.unlock(recoveryKey)',
    prerequisite: 'Local vault exists and is locked',
    unavailable: { empty: 'Link to vault setup', locked: 'Prompt for key', failure: 'Vault error' },
  },
  remembered: {
    ...defaults,
    id: 'app.vault.unlock-remembered',
    labelKey: 'remembered',
    helpKey: 'remember',
    command: 'LocalVault.unlock()',
    prerequisite: 'Local vault has a remembered key',
    unavailable: { empty: 'Omit', locked: 'Offer remembered unlock', failure: 'Vault error' },
  },
  approve: {
    ...defaults,
    id: 'app.vault.approve-device',
    labelKey: 'approve',
    helpKey: 'pairingHelp',
    command: 'LocalVault.approveTransfer(pairingCode) and download encrypted approval file',
    prerequisite: 'Unlocked local vault and recipient pairing code',
    composition: 'Device approval and Account security',
    unavailable: {
      empty: 'Link to vault setup on Device approval',
      locked: 'Omit',
      failure: 'Vault error',
    },
  },
  lock: {
    ...defaults,
    id: 'app.vault.lock',
    labelKey: 'lock',
    helpKey: 'unlockHelp',
    command: 'LocalVault.lock() and clear decrypted UI',
    prerequisite: 'Unlocked local vault',
    unavailable: { empty: 'Omit', locked: 'Omit', failure: 'Clear decrypted UI' },
  },
} as const satisfies Record<string, ControlContract>;
