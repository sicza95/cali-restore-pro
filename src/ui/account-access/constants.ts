export const authErrorMessages = {
  invalid_or_expired_link: 'invalid',
  invalid_credentials: 'credentials',
  authentication_required: 'signedOut',
  try_later: 'limited',
  credential_confirmation_required: 'recent',
  not_permitted: 'forbidden',
} as const;

export const sessionEndingActions = [
  '/account/deletion',
  'logout',
  'change-password',
  'reset-password',
  'confirm-email',
];
