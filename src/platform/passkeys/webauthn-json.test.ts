import { describe, expect, it } from 'vitest';
import {
  assertionJSON,
  creationOptions,
  fromBase64url,
  passkeyErrorCode,
  registrationJSON,
  requestOptions,
  toBase64url,
} from './webauthn-json';

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

describe('passkey JSON conversion', () => {
  it('round-trips base64url without padding and rejects other alphabets', () => {
    for (const length of [0, 1, 2, 3, 32, 33]) {
      const value = new Uint8Array(length).map((_, i) => (i * 37 + 250) % 256);
      const text = toBase64url(value);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(new Uint8Array(fromBase64url(text))).toEqual(value);
    }
    expect(toBase64url(bytes(0xfb, 0xff))).toBe('-_8');
    expect(() => fromBase64url('a+b/')).toThrow('passkey_rejected');
    expect(() => fromBase64url('abc=')).toThrow('passkey_rejected');
  });

  it('decodes binary creation and request fields and drops unrequested ones', () => {
    const creation = creationOptions({
      rp: { id: 'localhost', name: 'CaliRestore Pro' },
      user: { id: 'AAEC', name: 'a@example.test', displayName: 'a@example.test' },
      challenge: 'AwQF',
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 300000,
      excludeCredentials: [{ type: 'public-key', id: 'Bgc', transports: ['internal'] }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      attestation: 'none',
      ...({ extensions: { prf: {} } } as object),
    });
    expect(new Uint8Array(creation.user.id as ArrayBuffer)).toEqual(new Uint8Array([0, 1, 2]));
    expect(new Uint8Array(creation.challenge as ArrayBuffer)).toEqual(new Uint8Array([3, 4, 5]));
    expect(creation.excludeCredentials?.[0]).toMatchObject({ type: 'public-key' });
    expect(new Uint8Array(creation.excludeCredentials?.[0].id as ArrayBuffer)).toEqual(
      new Uint8Array([6, 7]),
    );
    expect(creation).not.toHaveProperty('extensions');
    const request = requestOptions({
      challenge: 'CAk',
      rpId: 'localhost',
      userVerification: 'required',
    });
    expect(new Uint8Array(request.challenge as ArrayBuffer)).toEqual(new Uint8Array([8, 9]));
    expect(request.allowCredentials).toEqual([]);
  });

  it('serializes registrations and assertions in the server JSON shape', () => {
    const base = { id: 'CgsM', rawId: bytes(10, 11, 12), type: 'public-key' };
    expect(
      registrationJSON({
        ...base,
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: bytes(1),
          attestationObject: bytes(2),
          getTransports: () => ['internal', 'hybrid'],
        } as unknown as AuthenticatorResponse,
      }),
    ).toEqual({
      id: 'CgsM',
      rawId: 'CgsM',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: 'AQ',
        attestationObject: 'Ag',
        transports: ['internal', 'hybrid'],
      },
    });
    expect(
      assertionJSON({
        ...base,
        authenticatorAttachment: null,
        response: {
          clientDataJSON: bytes(1),
          authenticatorData: bytes(3),
          signature: bytes(4),
          userHandle: bytes(5),
        } as unknown as AuthenticatorResponse,
      }),
    ).toEqual({
      id: 'CgsM',
      rawId: 'CgsM',
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: 'AQ',
        authenticatorData: 'Aw',
        signature: 'BA',
        userHandle: 'BQ',
      },
    });
  });

  it('maps browser and server failures to identity error codes', () => {
    const named = (name: string) => Object.assign(new Error('browser text'), { name });
    expect(passkeyErrorCode(named('NotAllowedError'))).toBe('passkey_cancelled');
    expect(passkeyErrorCode(named('AbortError'))).toBe('passkey_cancelled');
    expect(passkeyErrorCode(named('InvalidStateError'))).toBe('passkey_exists');
    expect(passkeyErrorCode(named('SecurityError'))).toBe('passkey_rejected');
    expect(passkeyErrorCode(new Error('credential_confirmation_required'))).toBe(
      'credential_confirmation_required',
    );
    expect(passkeyErrorCode('nothing')).toBe('passkey_rejected');
  });
});
