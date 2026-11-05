import { Aes128Gcm, CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from '@hpke/core';
import type { LocalVault } from '../vault/vault';

const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes128Gcm(),
});
const encoder = new TextEncoder();
const fixture = 'Synthetic assessment: surface condition recorded.';
const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const base64 = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value)));
const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');

type GrantContext = { project: string; invitation: string; sender: string; recipient: string };
export type FixtureEnvelope = { encapsulation: string; ciphertext: string };
const binding = ({ project, invitation, sender, recipient }: GrantContext) =>
  encoder.encode(
    JSON.stringify([
      'calirestore',
      'assessment-fixture',
      1,
      1,
      project,
      invitation,
      sender,
      recipient,
    ]),
  );

export async function sharingFingerprint(publicKey: string) {
  return hex(await crypto.subtle.digest('SHA-256', bytes(publicKey)));
}

export async function localSharingKey(
  vault: LocalVault,
  pin?: { account: string; fingerprint: string },
) {
  const { seed, signal } = await vault.sharingIdentity(pin);
  const material = Uint8Array.from(seed.match(/../g)!, (byte) => Number.parseInt(byte, 16));
  try {
    const pair = await suite.kem.deriveKeyPair(material);
    const publicKey = base64(await suite.kem.serializePublicKey(pair.publicKey));
    signal.throwIfAborted();
    return { pair, publicKey, signal };
  } finally {
    material.fill(0);
  }
}

export async function sealFixture(
  senderKey: CryptoKeyPair,
  recipient: string,
  context: GrantContext,
) {
  const recipientPublicKey = await suite.kem.deserializePublicKey(bytes(recipient));
  const result = await suite.seal(
    { senderKey, recipientPublicKey },
    encoder.encode(fixture),
    binding(context),
  );
  return { encapsulation: base64(result.enc), ciphertext: base64(result.ct) };
}

export async function openFixture(
  recipientKey: CryptoKeyPair,
  sender: string,
  envelope: FixtureEnvelope,
  context: GrantContext,
) {
  const senderPublicKey = await suite.kem.deserializePublicKey(bytes(sender));
  const result = await suite.open(
    { recipientKey, senderPublicKey, enc: bytes(envelope.encapsulation) },
    bytes(envelope.ciphertext),
    binding(context),
  );
  if (new TextDecoder().decode(result) !== fixture) throw new Error('Invalid assessment fixture');
}
