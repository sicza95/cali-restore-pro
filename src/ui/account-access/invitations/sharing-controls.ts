import { registerPlatformControls } from '../register-platform-controls';

export const sharingControls = [
  ...registerPlatformControls(
    {
      composition: 'Project collaboration',
      owner: 'M-06',
      permission: 'Server-authorized project owner and unlocked vault',
      valueSource: 'Hosted invitation state and client-sealed envelopes',
      helpKey: 'error',
      unavailable: {
        failure: 'Show generic access, quota, delivery or fingerprint error.',
        empty: 'Hide commands in inapplicable invitation states.',
        locked: 'Clear decrypted grants and require unlock.',
      },
    },
    [
      ['sharing.recipient', 'recipient', 'Enter verified account email', 'Hosting enabled'],
      [
        'sharing.estimate',
        'estimateScope',
        'Select no, summary or full estimate envelope',
        'Hosting enabled',
      ],
      ['sharing.history', 'includeHistory', 'Select optional history envelope', 'Hosting enabled'],
      ['sharing.co-owner', 'inviteCoOwner', 'Select co-owner invitation', 'Hosting enabled'],
      [
        'sharing.issue',
        'issue',
        'Issue account-bound invitation',
        'Verified recipient and eligible host',
      ],
      [
        'sharing.cancel',
        'cancel',
        'Cancel pending invitation or accepted unactivated grant',
        'Pending or accepted invitation',
      ],
      [
        'sharing.revoke',
        'revoke',
        'Revoke access and pause future publication pending rotation',
        'Pending or active invitation, with confirmation',
      ],
      [
        'sharing.recipient-code',
        'recipientCode',
        'Verify recipient sharing fingerprint',
        'Accepted grant or pending rotation',
      ],
      [
        'sharing.originals',
        'includeOriginals',
        'Include encrypted original-file grants',
        'Accepted invitation or pending rotation with eligible originals',
      ],
      [
        'sharing.refresh',
        'refresh',
        'Refresh outgoing invitations',
        'Open hosted collaboration panel',
      ],
      [
        'sharing.activate',
        'activate',
        'Seal and publish project and selected grants to verified recipient',
        'Accepted invitation and verified recipient fingerprint',
      ],
      [
        'sharing.rotate',
        'rotate',
        'Publish a new encrypted original-file epoch',
        'Rotation required, remaining grant and verified fingerprint',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Project collaboration',
      owner: 'M-06',
      permission: 'Server-authorized project owner and unlocked vault',
      valueSource: 'Pending invitation status',
      helpKey: 'resendUnavailable',
      behavior: 'review',
      unavailable: {
        failure: 'Show disabled Resend with service reason.',
        empty: 'Hide outside a pending invitation.',
        locked: 'Hide invitation controls at vault gate.',
      },
    },
    [
      [
        'sharing.resend',
        'resend',
        'Resend generic notification for existing pending invitation',
        'Pending invitation and M-06 resend endpoint',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Invitation inbox',
      owner: 'M-06',
      permission: 'Verified matching account and unlocked vault',
      valueSource: 'Authorized invitation and independently encrypted scope envelopes',
      helpKey: 'error',
      unavailable: {
        failure: 'Fail closed on denied access, mismatched fingerprints or invalid ciphertext.',
        empty: 'Hide content and grant-specific controls when absent.',
        locked: 'Clear opened snapshots and require unlock.',
      },
    },
    [
      [
        'invitations.accept',
        'accept',
        'Accept account-bound pending invitation',
        'Invitation awaiting acceptance',
      ],
      [
        'invitations.owner-code',
        'senderCode',
        'Verify sender fingerprint before decryption',
        'Active grant',
      ],
      [
        'invitations.open',
        'open',
        'Open authorized encrypted project snapshot',
        'Active assessment grant and verified owner fingerprint',
      ],
      [
        'invitations.refresh',
        'refresh',
        'Refresh invitations and clear the old scope projection',
        'Unlocked invitation inbox',
      ],
      [
        'invitations.scope.estimate-summary',
        'estimate-summary',
        'Verify and decrypt estimate-summary envelope read-only',
        'Active invitation with separate estimate-summary grant and verified sender fingerprint',
      ],
      [
        'invitations.scope.estimate-full',
        'estimate-full',
        'Verify and decrypt estimate-full envelope read-only',
        'Active invitation with separate estimate-full grant and verified sender fingerprint',
      ],
      [
        'invitations.scope.history',
        'history',
        'Verify and decrypt history envelope read-only',
        'Active invitation with separate history grant and verified sender fingerprint',
      ],
      [
        'sharing.fingerprint',
        'identity',
        'Show current vault sharing fingerprint for external verification',
        'Unlocked vault and invitation panel',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Hosted owners and hosting transfer',
      owner: 'M-06',
      permission: 'Server-authorized owner or transfer recipient',
      valueSource: 'Server owner and quota policy',
      helpKey: 'hostingQuota',
      unavailable: {
        failure: 'Keep current owner and host roles until server acknowledgment.',
        empty: 'Hide commands without eligible owner or pending transfer.',
        locked: 'Hide controls outside unlocked project collaboration.',
      },
    },
    [
      [
        'owners.host.accept',
        'acceptHosting',
        'Accept quota responsibility for offered hosting transfer',
        'Current owner is transfer recipient',
      ],
      [
        'owners.host.claim',
        'claimHosting',
        'Claim eligible vacant hosting role',
        'Current owner and no eligible current host',
      ],
      [
        'owners.host.offer',
        'offerHosting',
        'Offer hosting transfer to another owner',
        'Current host and eligible different owner',
      ],
      [
        'owners.remove',
        'removeOwner',
        'Remove eligible owner or leave project',
        'Non-host owner target and server continuity checks',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Invitation scope editor',
      owner: 'M-06',
      permission: 'Authorized project owner and active invitation',
      valueSource: 'Current scope policy and independently sealed envelopes',
      helpKey: 'error',
      unavailable: {
        failure: 'Retain last acknowledged scopes and report failure.',
        empty: 'Hide until active and disable unchanged submission.',
        locked: 'Clear decrypted content.',
      },
    },
    [
      [
        'sharing.scopes.open',
        'editScopes',
        'Open scoped grant editor',
        'Active invitation with scoped access',
      ],
      [
        'sharing.scopes.apply',
        'saveScopes',
        'Replace allowed encrypted scope envelopes',
        'Active invitation, changed grant and verified recipient for additions',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Individual checkpoint grants',
      owner: 'M-06',
      permission: 'Authorized grant owner or invited checkpoint reader',
      valueSource: 'Authenticated sample checkpoint envelopes',
      helpKey: 'noCheckpoints',
      unavailable: {
        failure: 'Fail closed on revoked or invalid checkpoint envelope.',
        empty: 'Omit commands without a matching sample or grant.',
        locked: 'Clear opened checkpoint projection.',
      },
    },
    [
      [
        'sharing.checkpoint.open',
        'openCheckpoint',
        'Read a granted checkpoint envelope',
        'Granted checkpoint and verified sender fingerprint',
      ],
      [
        'sharing.checkpoint.grant',
        'shareCheckpoint',
        'Publish separately sealed sample checkpoint grant',
        'Unshared sample checkpoint and verified recipient fingerprint',
      ],
      [
        'sharing.checkpoint.revoke',
        'removeCheckpoint',
        'Remove individual checkpoint grant',
        'Currently shared checkpoint',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Shared originals',
      owner: 'M-07',
      permission: 'Authorized recipient and unlocked account vault',
      valueSource: 'Encrypted file grants and local pin state',
      helpKey: 'failed',
      unavailable: {
        failure: 'Show failure and retain incomplete encrypted pin for retry.',
        empty: 'Hide per-file actions when no grant; show cancel during a pin.',
        locked: 'Abort downloads and pinning.',
      },
    },
    [
      [
        'sharing.pin.cancel',
        'cancel',
        'Cancel offline pin without marking incomplete bytes complete',
        'Pin in progress',
      ],
      [
        'sharing.original.download',
        'downloadOriginal',
        'Download and authenticate granted original',
        'Active file grant and network access',
      ],
      [
        'sharing.pin.start',
        'pin',
        'Pin encrypted original for offline use or retry an incomplete pin',
        'Active file grant, connected browser and verified file key',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Offline originals shelf',
      owner: 'M-07',
      permission: 'Matching offline account marker and unlocked vault',
      valueSource: 'Complete local pins and last acknowledged grant status',
      helpKey: 'failed',
      unavailable: {
        failure: 'Block incomplete or revoked pins and show retryable errors.',
        empty: 'Show empty shelf.',
        locked: 'Hide pinned originals.',
      },
    },
    [
      [
        'offline.original.download',
        'open',
        'Open complete authorized encrypted local pin',
        'Complete authorized pin and unlocked vault',
      ],
      [
        'offline.original.remove',
        'remove',
        'Remove a locally pinned original',
        'Account-local pin and unlocked vault',
      ],
    ],
  ),
];
