import { createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { importCode, maxFile, newCode, open, parseEnvelope, seal } from './crypto';
import type { Envelope } from './crypto';

const code = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const otherCode = 'f'.repeat(64);
const account = '11111111-1111-4111-8111-111111111111';
const text = 'Gesso, 12.5 m² — ő ű 🖌';

const bytes = (value: string) => Buffer.from(value, 'base64');
const flip = (value: string, index: number) => {
  const raw = bytes(value);
  raw[(index + raw.length) % raw.length]! ^= 0x01;
  return raw.toString('base64');
};

// An independent implementation of the documented envelope: HKDF-SHA-256 over the raw code with
// the envelope salt and a JSON context, then AES-256-GCM with a zero IV and the context as AAD.
function context(purpose: string) {
  return Buffer.from(JSON.stringify(['calirestore-vault', 1, account, purpose]));
}
function nodeKey(salt: Buffer, purpose: string) {
  return Buffer.from(hkdfSync('sha256', Buffer.from(code, 'hex'), salt, context(purpose), 32));
}
function nodeSeal(purpose: string, value: string, salt: Buffer): Envelope {
  const cipher = createCipheriv('aes-256-gcm', nodeKey(salt, purpose), Buffer.alloc(12));
  cipher.setAAD(context(purpose));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    version: 1,
    salt: salt.toString('base64'),
    ciphertext: Buffer.concat([body, cipher.getAuthTag()]).toString('base64'),
  };
}
function nodeOpen(purpose: string, envelope: Envelope) {
  const raw = bytes(envelope.ciphertext);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    nodeKey(bytes(envelope.salt), purpose),
    Buffer.alloc(12),
  );
  decipher.setAAD(context(purpose));
  decipher.setAuthTag(raw.subarray(-16));
  return JSON.parse(
    Buffer.concat([decipher.update(raw.subarray(0, -16)), decipher.final()]).toString('utf8'),
  ) as unknown;
}

describe('vault envelope', () => {
  it('round-trips text and has the documented shape', async () => {
    const root = await importCode(code);
    const envelope = await seal(root, account, 'snapshot', text);
    expect(envelope.version).toBe(1);
    expect(bytes(envelope.salt)).toHaveLength(32);
    // JSON-quoted UTF-8 plaintext plus a 16-byte GCM tag.
    expect(bytes(envelope.ciphertext)).toHaveLength(Buffer.byteLength(JSON.stringify(text)) + 16);
    expect(await open(root, account, 'snapshot', envelope)).toBe(text);
  });

  it('uses a fresh salt for every seal', async () => {
    const root = await importCode(code);
    const [a, b] = await Promise.all([
      seal(root, account, 'snapshot', text),
      seal(root, account, 'snapshot', text),
    ]);
    expect(a.salt).not.toBe(b.salt);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('matches an independent HKDF + AES-GCM implementation both ways', async () => {
    const root = await importCode(code);
    const purpose = 'project:22222222-2222-4222-8222-222222222222:3';
    const known = nodeSeal(purpose, text, Buffer.alloc(32, 7));
    expect(await open(root, account, purpose, known)).toBe(text);
    const sealed = await seal(root, account, purpose, text);
    expect(nodeOpen(purpose, sealed)).toBe(text);
  });

  it.each([
    ['another key', otherCode, account, 'snapshot'],
    ['another account', code, '33333333-3333-4333-8333-333333333333', 'snapshot'],
    ['another purpose', code, account, 'transfer'],
  ] as const)('rejects opening with %s', async (_label, keyCode, who, purpose) => {
    const envelope = await seal(await importCode(code), account, 'snapshot', text);
    await expect(open(await importCode(keyCode), who, purpose, envelope)).rejects.toThrow();
  });

  it.each([
    ['the first ciphertext byte', (e: Envelope) => ({ ...e, ciphertext: flip(e.ciphertext, 0) })],
    ['the auth tag', (e: Envelope) => ({ ...e, ciphertext: flip(e.ciphertext, -1) })],
    ['the salt', (e: Envelope) => ({ ...e, salt: flip(e.salt, 5) })],
    [
      'a truncated ciphertext',
      (e: Envelope) => ({
        ...e,
        ciphertext: bytes(e.ciphertext).subarray(0, -1).toString('base64'),
      }),
    ],
  ])('rejects a change to %s', async (_label, tamper) => {
    const root = await importCode(code);
    const envelope = await seal(root, account, 'snapshot', text);
    await expect(open(root, account, 'snapshot', tamper(envelope))).rejects.toThrow();
  });

  it('rejects a well-formed envelope whose plaintext is not a JSON string', async () => {
    const root = await importCode(code);
    const forged = nodeSeal('snapshot', text, Buffer.alloc(32, 1));
    const cipher = createCipheriv(
      'aes-256-gcm',
      nodeKey(bytes(forged.salt), 'snapshot'),
      Buffer.alloc(12),
    );
    cipher.setAAD(context('snapshot'));
    const body = Buffer.concat([
      cipher.update('{"a":1}', 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    const envelope = { ...forged, ciphertext: body.toString('base64') };
    await expect(open(root, account, 'snapshot', envelope)).rejects.toThrow('Invalid snapshot');
  });

  it('limits text by purpose', async () => {
    const root = await importCode(code);
    await expect(seal(root, account, 'snapshot', 'x'.repeat(64 * 1024 + 1))).rejects.toThrow(
      'Text too large',
    );
    const large = 'x'.repeat(100_000);
    const purpose = 'project:22222222-2222-4222-8222-222222222222:1';
    expect(await open(root, account, purpose, await seal(root, account, purpose, large))).toBe(
      large,
    );
  });
});

describe('parseEnvelope', () => {
  const salt = Buffer.alloc(32, 9).toString('base64');
  const ciphertext = Buffer.alloc(16, 3).toString('base64');

  it('accepts a canonical envelope', () => {
    expect(parseEnvelope(JSON.stringify({ version: 1, salt, ciphertext, extra: true }))).toEqual({
      version: 1,
      salt,
      ciphertext,
    });
  });

  it.each([
    ['version 2', { version: 2, salt, ciphertext }],
    ['a missing salt', { version: 1, ciphertext }],
    ['a 31-byte salt', { version: 1, salt: Buffer.alloc(31).toString('base64'), ciphertext }],
    ['a ciphertext shorter than a tag', { version: 1, salt, ciphertext: 'AAAA' }],
    ['non-canonical base64', { version: 1, salt: salt.replace(/=$/, ''), ciphertext }],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(() => parseEnvelope(JSON.stringify(value))).toThrow('Invalid envelope');
  });

  it('rejects an oversized file before parsing', () => {
    expect(() => parseEnvelope(' '.repeat(maxFile + 1))).toThrow('File too large');
  });
});

describe('codes', () => {
  it('generates 32 random bytes as lowercase hex', () => {
    const a = newCode();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(newCode()).not.toBe(a);
  });

  it('imports any-case hex with surrounding space as a non-extractable HKDF key', async () => {
    const key = await importCode(`  ${code.toUpperCase()}\n`);
    expect(key.algorithm.name).toBe('HKDF');
    expect(key.extractable).toBe(false);
    expect(key.usages).toEqual(['deriveKey']);
  });

  it.each([code.slice(1), code + '0', 'g'.repeat(64), ''])('rejects %j', async (value) => {
    await expect(importCode(value)).rejects.toThrow('Invalid key');
  });
});
