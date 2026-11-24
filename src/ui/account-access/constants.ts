export const authErrorMessages = {
  invalid_or_expired_link: 'invalid',
  invalid_credentials: 'credentials',
  authentication_required: 'signedOut',
  try_later: 'limited',
  credential_confirmation_required: 'recent',
  not_permitted: 'forbidden',
  passkey_cancelled: 'passkeyCancelled',
  passkey_exists: 'passkeyExists',
  passkey_rejected: 'passkeyRejected',
  passkeys_unavailable: 'passkeyUnavailable',
} as const;

export const sessionEndingActions = [
  '/account/deletion',
  'logout',
  'change-password',
  'confirm-email',
];
