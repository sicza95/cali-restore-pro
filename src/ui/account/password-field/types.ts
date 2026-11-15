import type { Translate } from '../../account-access/types';

export type PasswordFieldProps = {
  t: Translate;
  kind: 'password' | 'newPassword' | 'currentPassword';
};
