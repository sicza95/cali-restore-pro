import type { Checkpoint } from './checkpoint-samples';
import { Aes128Gcm, CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from '@hpke/core';
import type { LocalVault } from '../vault/vault';
import { parseSharedProject } from './shared-project';
import type { SharedProject } from './shared-project';
import { parseSharedOriginals } from './shared-originals';
import type { SharedOriginal } from './shared-originals';
import { parseScopeSample, scopeSamples } from './sharing-scopes';
import type { OptionalScope } from './sharing-scopes';
import { parseEstimateScope } from '../estimates/scopes';

const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes128Gcm(),
});
const encoder = new TextEncoder();
const fixture = 'Synthetic assessment: surface condition recorded.';
const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const base64 = (value: ArrayBuffer) =>
  btoa(Array.from(new Uint8Array(value), (byte) => String.fromCharCode(byte)).join(''));
const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');

type GrantContext = { project: string; invitation: string; sender: string; recipient: string };
export type ScopeEnvelope = { scope: OptionalScope; encapsulation: string; ciphertext: string };
export type SharingEnvelope = {
  encapsulation: string;
  ciphertext: string;
  format: 'fixture-v1' | 'project-v1';
};
const binding = (
  { project, invitation, sender, recipient }: GrantContext,
  format: SharingEnvelope['format'],
) =>
  encoder.encode(
    JSON.stringify([
      'calirestore',
      format === 'project-v1' ? 'project-assessment' : 'assessment-fixture',
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

export async function sealProjectSnapshot(
  senderKey: CryptoKeyPair,
  recipient: string,
  context: GrantContext,
  project: SharedProject,
  originals: SharedOriginal[] = [],
) {
  const format = 'project-v1';
  const plaintext = encoder.encode(
    JSON.stringify(originals.length ? { ...project, originals } : project),
  );
  if (plaintext.byteLength > 64 * 1024) throw new Error('Project snapshot exceeds 64 KiB');
  const recipientPublicKey = await suite.kem.deserializePublicKey(bytes(recipient));
  const result = await suite.seal(
    { senderKey, recipientPublicKey },
    plaintext,
    binding(context, format),
  );
  return { format, encapsulation: base64(result.enc), ciphertext: base64(result.ct) };
}

export async function openSharedContent(
  recipientKey: CryptoKeyPair,
  sender: string,
  envelope: SharingEnvelope,
  context: GrantContext,
) {
  if (envelope.format !== 'fixture-v1' && envelope.format !== 'project-v1')
    throw new Error('Unknown sharing format');
  const senderPublicKey = await suite.kem.deserializePublicKey(bytes(sender));
  const result = await suite.open(
    { recipientKey, senderPublicKey, enc: bytes(envelope.encapsulation) },
    bytes(envelope.ciphertext),
    binding(context, envelope.format),
  );
  const text = new TextDecoder('utf-8', { fatal: true }).decode(result);
  if (envelope.format === 'project-v1') {
    const project = parseSharedProject(text);
    const originals = parseSharedOriginals((JSON.parse(text) as { originals?: unknown }).originals);
    return { project, originals };
  }
  if (text !== fixture) throw new Error('Invalid assessment fixture');
  return undefined;
}

const scopeBinding = (
  { project, invitation, sender, recipient }: GrantContext,
  scope: OptionalScope,
) =>
  encoder.encode(
    JSON.stringify([
      'calirestore',
      'project-scope',
      1,
      project,
      invitation,
      sender,
      recipient,
      scope,
    ]),
  );

export async function sealScope(
  senderKey: CryptoKeyPair,
  recipient: string,
  context: GrantContext,
  scope: OptionalScope,
  content?: unknown,
): Promise<ScopeEnvelope> {
  const recipientPublicKey = await suite.kem.deserializePublicKey(bytes(recipient));
  const { enc, ct } = await suite.seal(
    { senderKey, recipientPublicKey },
    encoder.encode(JSON.stringify(content ?? scopeSamples[scope])),
    scopeBinding(context, scope),
  );
  return { scope, encapsulation: base64(enc), ciphertext: base64(ct) };
}

export async function openScope(
  recipientKey: CryptoKeyPair,
  sender: string,
  envelope: ScopeEnvelope,
  context: GrantContext,
  scope: OptionalScope,
) {
  if (envelope.scope !== scope) throw new Error('Unexpected scope');
  const senderPublicKey = await suite.kem.deserializePublicKey(bytes(sender));
  const result = await suite.open(
    { recipientKey, senderPublicKey, enc: bytes(envelope.encapsulation) },
    bytes(envelope.ciphertext),
    scopeBinding(context, scope),
  );
  const text = new TextDecoder('utf-8', { fatal: true }).decode(result);
  return parseEstimateScope(scope, text, context.project) ?? parseScopeSample(scope, text);
}

export type CheckpointEnvelope = {
  checkpointId: string;
  encapsulation: string;
  ciphertext: string;
};

const checkpointBinding = (context: GrantContext, id: string) =>
  encoder.encode(
    JSON.stringify([
      'calirestore',
      'project-checkpoint',
      1,
      context.project,
      context.invitation,
      context.sender,
      context.recipient,
      id,
    ]),
  );

export async function sealCheckpoint(
  senderKey: CryptoKeyPair,
  recipient: string,
  context: GrantContext,
  checkpoint: Checkpoint,
) {
  const recipientPublicKey = await suite.kem.deserializePublicKey(bytes(recipient));
  const { enc, ct } = await suite.seal(
    { senderKey, recipientPublicKey },
    encoder.encode(JSON.stringify([checkpoint.title, checkpoint.description])),
    checkpointBinding(context, checkpoint.id),
  );
  return { encapsulation: base64(enc), ciphertext: base64(ct) };
}

export async function openCheckpoint(
  recipientKey: CryptoKeyPair,
  sender: string,
  envelope: CheckpointEnvelope,
  context: GrantContext,
  id: string,
): Promise<Checkpoint> {
  if (envelope.checkpointId !== id) throw new Error('Unexpected checkpoint');
  const senderPublicKey = await suite.kem.deserializePublicKey(bytes(sender));
  const result = await suite.open(
    { recipientKey, senderPublicKey, enc: bytes(envelope.encapsulation) },
    bytes(envelope.ciphertext),
    checkpointBinding(context, id),
  );
  const rows: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result));
  if (
    !Array.isArray(rows) ||
    rows.length !== 2 ||
    rows.some((row) => typeof row !== 'string' || !row.trim() || row.length > 400)
  )
    throw new Error('Invalid checkpoint');
  return { id, title: rows[0], description: rows[1] };
}
