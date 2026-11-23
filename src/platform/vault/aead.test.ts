import { describe, expect, it } from 'vitest';
import { aead, decrypt, encrypt } from './aead';
import { importCode, open, seal } from './crypto';

const code = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const algorithm = { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 };

describe('plaintext mode', () => {
  it('is the default', () => {
    expect(aead.enabled).toBe(false);
  });

  it('keeps the bytes readable and the AES-GCM size', async () => {
    const key = await importCode(code);
    const bytes = new TextEncoder().encode('Gesso, 12.5 m²');
    const sealed = new Uint8Array(await encrypt(algorithm, key, bytes));
    expect(sealed.byteLength).toBe(bytes.byteLength + 16);
    expect(sealed.subarray(0, bytes.byteLength)).toEqual(bytes);
    expect(new Uint8Array(await decrypt(algorithm, key, sealed))).toEqual(bytes);
  });

  it('opens a view into a larger buffer', async () => {
    const key = await importCode(code);
    const buffer = new Uint8Array([9, 9, 1, 2, ...new Uint8Array(16)]);
    const part = new Uint8Array(buffer.buffer, 2);
    expect(new Uint8Array(await decrypt(algorithm, key, part))).toEqual(new Uint8Array([1, 2]));
  });

  it('refuses data that was really encrypted', async () => {
    const key = await importCode(code);
    await expect(decrypt(algorithm, key, new Uint8Array(20).fill(1))).rejects.toThrow();
    await expect(decrypt(algorithm, key, new Uint8Array(15))).rejects.toThrow();
  });

  it('round-trips a vault envelope with readable content', async () => {
    const root = await importCode(code);
    const envelope = await seal(root, 'account', 'snapshot', 'Private notes');
    expect(atob(envelope.ciphertext)).toContain('Private notes');
    expect(await open(root, 'account', 'snapshot', envelope)).toBe('Private notes');
  });
});
