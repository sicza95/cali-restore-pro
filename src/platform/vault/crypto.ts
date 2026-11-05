const maxText = 64 * 1024;
export const maxFile = 600_000;
const encode = new TextEncoder();
const decode = new TextDecoder('utf-8', { fatal: true });

export type Envelope = { version: 1; salt: string; ciphertext: string };
type Purpose = 'snapshot' | 'transfer' | 'sharing-identity' | `project:${string}`;

export const newCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

export async function importCode(code: string) {
  const hex = code.trim();
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error('Invalid key');
  const bytes = Uint8Array.from(hex.match(/../g)!, (pair) => Number.parseInt(pair, 16));
  try {
    return await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  } finally {
    bytes.fill(0);
  }
}

const base64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const unbase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export function parseEnvelope(file: string): Envelope {
  if (file.length > maxFile) throw new Error('File too large');
  const value: unknown = JSON.parse(file);
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('salt' in value) ||
    typeof value.salt !== 'string' ||
    !('ciphertext' in value) ||
    typeof value.ciphertext !== 'string'
  )
    throw new Error('Invalid envelope');
  const salt = unbase64(value.salt);
  const bytes = unbase64(value.ciphertext);
  if (
    salt.length !== 32 ||
    bytes.length < 16 ||
    base64(salt) !== value.salt ||
    base64(bytes) !== value.ciphertext
  )
    throw new Error('Invalid envelope');
  return { version: 1, salt: value.salt, ciphertext: value.ciphertext };
}

async function parameters(
  root: CryptoKey,
  account: string,
  purpose: Purpose,
  salt: Uint8Array<ArrayBuffer>,
) {
  const context = encode.encode(JSON.stringify(['calirestore-vault', 1, account, purpose]));
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: context },
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return {
    key,
    algorithm: { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128, additionalData: context },
  };
}

export async function seal(root: CryptoKey, account: string, purpose: Purpose, text: string) {
  if (text.length > maxText) throw new Error('Text too large');
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const { key, algorithm } = await parameters(root, account, purpose, salt);
  const ciphertext = await crypto.subtle.encrypt(
    algorithm,
    key,
    encode.encode(JSON.stringify(text)),
  );
  return {
    version: 1,
    salt: base64(salt),
    ciphertext: base64(new Uint8Array(ciphertext)),
  } as const;
}

export async function open(root: CryptoKey, account: string, purpose: Purpose, envelope: Envelope) {
  const parsed = parseEnvelope(JSON.stringify(envelope));
  const { key, algorithm } = await parameters(root, account, purpose, unbase64(parsed.salt));
  const bytes = await crypto.subtle.decrypt(algorithm, key, unbase64(parsed.ciphertext));
  const text: unknown = JSON.parse(decode.decode(bytes));
  if (typeof text !== 'string' || text.length > maxText) throw new Error('Invalid snapshot');
  return text;
}
