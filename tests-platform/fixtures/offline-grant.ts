import { LocalVault } from '../../src/platform/vault/vault';
import {
  localSharingKey,
  sealProjectSnapshot,
  sharingFingerprint,
} from '../../src/platform/projects/fixture-sharing';
import type { SharedOriginal } from '../../src/platform/projects/shared-originals';

export async function createGrant({
  recipient,
  sender,
  invitation,
  project,
  original,
}: {
  recipient: string;
  sender: string;
  invitation: string;
  project: string;
  original: SharedOriginal;
}) {
  const receiver = new LocalVault(recipient, () => undefined);
  const owner = new LocalVault(sender, () => undefined);
  await receiver.create('aa'.repeat(32), true);
  await owner.create('bb'.repeat(32), false);
  const from = await localSharingKey(owner);
  const to = await localSharingKey(receiver);
  const envelope = await sealProjectSnapshot(
    from.pair,
    to.publicKey,
    { recipient, sender, invitation, project },
    {
      name: 'Chapel',
      revision: 1,
      objects: [{ name: 'Wall', surfaces: [{ name: 'Plaster', units: 'metric' }] }],
    },
    [original],
  );
  owner.close();
  receiver.close();
  return {
    envelope: { ...envelope, senderId: sender, senderKey: from.publicKey },
    fingerprint: await sharingFingerprint(from.publicKey),
  };
}
