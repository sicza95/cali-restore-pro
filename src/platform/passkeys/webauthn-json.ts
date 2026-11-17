// Converts the server's WebAuthn JSON (base64url binary fields) to browser
// credential options and back. Written out rather than relying on
// PublicKeyCredential.parseCreationOptionsFromJSON/toJSON, which older iPad
// Safari releases lack. Only fields the server sends are copied; no extensions
// are requested, so none are returned.

export type DescriptorJSON = {
  type: 'public-key';
  id: string;
  transports?: AuthenticatorTransport[];
};
export type CreationOptionsJSON = {
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: 'public-key'; alg: number }[];
  timeout?: number;
  excludeCredentials?: DescriptorJSON[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
};
export type RequestOptionsJSON = {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: DescriptorJSON[];
  userVerification?: UserVerificationRequirement;
};

export function toBase64url(value: ArrayBuffer | ArrayBufferView) {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(value: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('passkey_rejected');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const text = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes.buffer;
}

const descriptors = (list: DescriptorJSON[] = []): PublicKeyCredentialDescriptor[] =>
  list.map((item) => ({
    type: item.type,
    id: fromBase64url(item.id),
    ...(item.transports ? { transports: item.transports } : {}),
  }));

export function creationOptions(json: CreationOptionsJSON): PublicKeyCredentialCreationOptions {
  return {
    rp: json.rp,
    user: { ...json.user, id: fromBase64url(json.user.id) },
    challenge: fromBase64url(json.challenge),
    pubKeyCredParams: json.pubKeyCredParams,
    timeout: json.timeout,
    excludeCredentials: descriptors(json.excludeCredentials),
    authenticatorSelection: json.authenticatorSelection,
    attestation: json.attestation,
  };
}

export function requestOptions(json: RequestOptionsJSON): PublicKeyCredentialRequestOptions {
  return {
    challenge: fromBase64url(json.challenge),
    timeout: json.timeout,
    rpId: json.rpId,
    allowCredentials: descriptors(json.allowCredentials),
    userVerification: json.userVerification,
  };
}

type Credential = Pick<PublicKeyCredential, 'id' | 'rawId' | 'type'> & {
  authenticatorAttachment?: string | null;
};

const common = (credential: Credential) => ({
  id: credential.id,
  rawId: toBase64url(credential.rawId),
  type: credential.type,
  ...(credential.authenticatorAttachment
    ? { authenticatorAttachment: credential.authenticatorAttachment }
    : {}),
  clientExtensionResults: {},
});

export function registrationJSON(
  credential: Credential & { response: AuthenticatorResponse },
): object {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    ...common(credential),
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      attestationObject: toBase64url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  };
}

export function assertionJSON(
  credential: Credential & { response: AuthenticatorResponse },
): object {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    ...common(credential),
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      authenticatorData: toBase64url(response.authenticatorData),
      signature: toBase64url(response.signature),
      ...(response.userHandle ? { userHandle: toBase64url(response.userHandle) } : {}),
    },
  };
}

/** Maps a WebAuthn DOMException to an identity error code the UI can show. */
export function passkeyErrorCode(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return 'passkey_cancelled';
  if (name === 'InvalidStateError') return 'passkey_exists';
  const message = error instanceof Error ? error.message : '';
  return /^[a-z_]+$/.test(message) ? message : 'passkey_rejected';
}
