import { Aes128Gcm, CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from '@hpke/core';
import { describe, expect, it } from 'vitest';
import { snapshot } from '../estimates/snapshots';
import type { EstimateInput } from '../estimates/types';
import { largeEstimate, withLongNames } from '../../../tests-platform/fixtures/large-estimate';
import { maxLocalDocument } from '../vault/crypto';
import { sealScope } from './fixture-sharing';
import { scopeGrantMaxBytes, ScopeTooLargeError } from './sharing-scopes';

const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes128Gcm(),
});
const id = () => crypto.randomUUID();
const context = { project: id(), invitation: id(), sender: id(), recipient: id() };

const fullScope = (input: EstimateInput) => ({
  schema: 1,
  scope: 'estimate-full',
  snapshot: snapshot(input, 3, true),
  freshness: 'current',
});

async function seal(content: unknown) {
  const pair = await suite.kem.generateKeyPair();
  const recipient = btoa(
    String.fromCharCode(...new Uint8Array(await suite.kem.serializePublicKey(pair.publicKey))),
  );
  return sealScope(pair, recipient, context, 'estimate-full', content);
}

const sealedBytes = (ciphertext: string) => atob(ciphertext).length;

// The device keeps an estimate (draft and issued snapshots) in at most 768 Ki characters
// (`maxLocalDocument` in src/platform/vault/crypto.ts), which bounds what a full scope can carry.
const vaultLimit = maxLocalDocument;

/** The most objects (one measured phase each) whose draft and one issued snapshot fit the vault. */
function largestSavable(customize: (input: EstimateInput) => EstimateInput) {
  let last: EstimateInput | undefined;
  for (let objects = 1; ; objects++) {
    const input = customize(largeEstimate(objects, 1, 1));
    const document = { schema: 1, draft: input, snapshots: [snapshot(input, 1, true)] };
    if (JSON.stringify(document).length > vaultLimit) return last!;
    last = input;
  }
}

describe('scope grant size (#88, #91)', () => {
  it.each([
    ['English names', (input: EstimateInput) => input],
    ['long Hungarian names', (input: EstimateInput) => withLongNames(input, 'ő')],
  ])('shares the largest estimate the device can save, with %s', async (_, customize) => {
    // Measured at about 36 KB and 42 KB at the old 64 Ki limit; about twelve times that now.
    const input = largestSavable(customize);
    const grant = await seal(fullScope(input));
    expect(input.phases.length).toBeGreaterThanOrEqual(150);
    expect(sealedBytes(grant.ciphertext)).toBeGreaterThan(300_000);
    expect(sealedBytes(grant.ciphertext)).toBeLessThanOrEqual(scopeGrantMaxBytes);
  });

  it('shares the two-object estimate the old 1536-byte limit refused', async () => {
    const grant = await seal(fullScope(largeEstimate(2, 1, 1)));
    expect(sealedBytes(grant.ciphertext)).toBeGreaterThan(1536);
  });

  it('refuses a scope over the limit before sealing it', async () => {
    const error = await seal(fullScope(withLongNames(largeEstimate(600, 1, 1), '€'))).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ScopeTooLargeError);
    expect((error as ScopeTooLargeError).bytes).toBeGreaterThan(scopeGrantMaxBytes);
  });

  it('accepts a scope of exactly the limit', async () => {
    // A JSON string of n characters encodes to n + 2 bytes; the tag adds 16.
    const grant = await seal('x'.repeat(scopeGrantMaxBytes - 18));
    expect(sealedBytes(grant.ciphertext)).toBe(scopeGrantMaxBytes);
    await expect(seal('x'.repeat(scopeGrantMaxBytes - 17))).rejects.toBeInstanceOf(
      ScopeTooLargeError,
    );
  });
});
