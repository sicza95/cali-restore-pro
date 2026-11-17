import {
  assertionJSON,
  creationOptions,
  passkeyErrorCode,
  registrationJSON,
  requestOptions,
  type CreationOptionsJSON,
  type RequestOptionsJSON,
} from '../../platform/passkeys/webauthn-json';
import { requestAuth } from './api';

type Ceremony<T> = { ceremony: string; publicKey: T };
export type PasskeyInfo = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  backupEligible: boolean;
  backupState: boolean;
  cloneWarning: boolean;
};

/** Browsers refuse passkeys on IP-address origins; the server offers none there either. */
export function passkeysSupported() {
  return (
    typeof PublicKeyCredential !== 'undefined' &&
    !!navigator.credentials &&
    !/^[\d.]+$|^\[/.test(location.hostname)
  );
}

const fail = (error: unknown): never => {
  throw new Error(passkeyErrorCode(error), { cause: error });
};

/** Discoverable sign-in: the authenticator chooses the account, no email is sent. */
export async function passkeyAssertion() {
  const options = await requestAuth<Ceremony<RequestOptionsJSON>>('passkey-login/options', '', {});
  const credential = await navigator.credentials
    .get({ publicKey: requestOptions(options.publicKey) })
    .catch(fail);
  if (!(credential instanceof PublicKeyCredential)) fail(new Error('passkey_cancelled'));
  return {
    ceremony: options.ceremony,
    credential: assertionJSON(credential as PublicKeyCredential),
  };
}

export async function passkeyRegistration(csrf: string, name: string) {
  const options = await requestAuth<Ceremony<CreationOptionsJSON>>(
    'passkeys/register/options',
    csrf,
    {},
  ).catch(fail);
  const credential = await navigator.credentials
    .create({ publicKey: creationOptions(options.publicKey) })
    .catch(fail);
  if (!(credential instanceof PublicKeyCredential)) fail(new Error('passkey_cancelled'));
  return {
    ceremony: options.ceremony,
    name,
    credential: registrationJSON(credential as PublicKeyCredential),
  };
}
