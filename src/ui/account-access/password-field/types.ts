import type { Translate } from '../types';

export type PasswordFieldProps = {
  t: Translate;
  kind: 'password' | 'newPassword' | 'currentPassword';
};
